import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { orderPlaced, productChanged } from '../../common/events/domain-events.js';
import { AuctionStatus, IdempotencyScope } from '../../generated/prisma/enums.js';
import type { Env } from '../../infra/config/env.schema.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../../infra/idempotency/idempotency.service.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { AuctionsRepository } from '../auctions/auctions.repository.js';
import { CartRepository } from '../cart/cart.repository.js';
import { unavailableReason } from '../cart/cart.rules.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { toOrderDto } from './order.mapper.js';
import { OrdersRepository } from './orders.repository.js';
import type { CheckoutDto, OrderDto } from './orders.dto.js';
import { type OrderDraft, percentToBps, type PricedLine, splitBySeller } from './pricing.js';

export class CheckoutRejected extends ConflictException {
  constructor(
    readonly reason: string,
    message: string | string[],
  ) {
    super(message);
  }
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly commissionRateBps: number;

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly cart: CartRepository,
    private readonly auctions: AuctionsRepository,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
    config: ConfigService<Env, true>,
    @InjectMetric(METRIC.ordersPlaced) private readonly placed: Counter<string>,
    @InjectMetric(METRIC.checkoutRejections) private readonly rejections: Counter<string>,
  ) {
    this.commissionRateBps = percentToBps(
      config.get('PLATFORM_COMMISSION_PERCENT', { infer: true }),
    );
  }

  checkout(
    buyerId: string,
    idempotencyKey: string,
    dto: CheckoutDto,
  ): Promise<IdempotentResult<OrderDto>> {
    return this.runCheckout(buyerId, idempotencyKey, dto, (tx) =>
      this.placeOrder(tx, buyerId, dto),
    );
  }

  checkoutAuction(
    buyerId: string,
    idempotencyKey: string,
    productId: string,
  ): Promise<IdempotentResult<OrderDto>> {
    return this.runCheckout(buyerId, idempotencyKey, { auctionProductId: productId }, (tx) =>
      this.placeAuctionOrder(tx, buyerId, productId),
    );
  }

  private async runCheckout(
    buyerId: string,
    idempotencyKey: string,
    payload: unknown,
    work: (tx: Transaction) => Promise<OrderDto>,
  ): Promise<IdempotentResult<OrderDto>> {
    try {
      const result = await this.idempotency.run(
        { userId: buyerId, scope: IdempotencyScope.CHECKOUT, key: idempotencyKey, payload },
        async (tx) => ({ status: HttpStatus.CREATED, body: await work(tx) }),
      );
      if (!result.replayed) {
        this.placed.inc();
        this.logger.log(
          { orderId: result.body.id, buyerId, totalMinor: result.body.totalMinor },
          'Order placed',
        );
      }
      return result;
    } catch (error) {
      if (error instanceof CheckoutRejected) {
        this.rejections.inc({ reason: error.reason });
      } else if (error instanceof HttpException && error.getStatus() < 500) {
        this.rejections.inc({ reason: String(error.getStatus()) });
      }
      throw error;
    }
  }

  private async placeOrder(tx: Transaction, buyerId: string, dto: CheckoutDto): Promise<OrderDto> {
    await this.cart.lockCart(buyerId, tx);
    const items = await this.cart.findItemsForCheckout(buyerId, tx);
    if (items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const problems = items
      .map((item) => ({ item, reason: unavailableReason(item.product, item.quantity, buyerId) }))
      .filter(({ reason }) => reason !== null)
      .map(({ item, reason }) => `${item.product.title} (${item.productId}): ${reason}`);
    if (problems.length > 0) {
      throw new CheckoutRejected('unavailable_items', problems);
    }

    const lines: PricedLine[] = [];
    for (const item of items) {
      const reserved = await this.inventory.reserve(item.productId, item.quantity, tx);
      if (!reserved) {
        throw new CheckoutRejected('stock_conflict', [
          `${item.product.title} (${item.productId}): INSUFFICIENT_STOCK`,
        ]);
      }
      lines.push({
        productId: reserved.id,
        sellerId: reserved.sellerId,
        title: reserved.title,
        unitPriceMinor: reserved.priceMinor,
        quantity: item.quantity,
      });
    }

    const draft = splitBySeller(lines, this.commissionRateBps);
    if (
      dto.expectedTotalMinor !== undefined &&
      BigInt(dto.expectedTotalMinor) !== draft.totalMinor
    ) {
      throw new CheckoutRejected(
        'price_changed',
        `Prices changed: the current total is ${draft.totalMinor}, review your cart`,
      );
    }

    const order = await this.createOrder(tx, buyerId, draft);
    await this.cart.removeItems(
      items.map((item) => item.id),
      tx,
    );
    return toOrderDto(order);
  }

  private async placeAuctionOrder(
    tx: Transaction,
    buyerId: string,
    productId: string,
  ): Promise<OrderDto> {
    const auction = await this.auctions.lockForCheckout(productId, tx);
    if (!auction || auction.winnerId !== buyerId) {
      throw new NotFoundException('No won auction for this product');
    }
    if (auction.status !== AuctionStatus.AWAITING_CHECKOUT) {
      throw new CheckoutRejected('auction_not_awaiting', 'This auction is not awaiting checkout');
    }
    if (!auction.windowOpen) {
      throw new CheckoutRejected('auction_window_expired', 'The checkout window has expired');
    }

    const reserved = await this.inventory.reserveLot(productId, tx);
    if (!reserved) {
      throw new CheckoutRejected('stock_conflict', 'The lot is no longer available');
    }

    const draft = splitBySeller(
      [
        {
          productId,
          sellerId: reserved.sellerId,
          title: reserved.title,
          unitPriceMinor: auction.currentPriceMinor!,
          quantity: 1,
        },
      ],
      this.commissionRateBps,
    );
    const order = await this.createOrder(tx, buyerId, draft);
    await this.auctions.setStatus(auction.id, AuctionStatus.SOLD, tx);
    return toOrderDto(order);
  }

  private async createOrder(tx: Transaction, buyerId: string, draft: OrderDraft) {
    const order = await this.orders.create(buyerId, draft, tx);
    await this.ledger.recordSales(order.sellerOrders, tx);

    await this.outbox.add(
      tx,
      orderPlaced({
        orderId: order.id,
        buyerId,
        totalMinor: order.totalMinor.toString(),
        sellerOrders: order.sellerOrders.map((so) => ({
          sellerOrderId: so.id,
          sellerId: so.sellerId,
        })),
      }),
      ...draft.sellerOrders.flatMap((sellerOrder) =>
        sellerOrder.lines.map((line) => productChanged(line.productId, 'stock_changed')),
      ),
    );

    return order;
  }
}
