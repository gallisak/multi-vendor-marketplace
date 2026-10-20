import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { productChanged } from '../../common/events/domain-events.js';
import { IdempotencyScope, SellerOrderStatus } from '../../generated/prisma/enums.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../../infra/idempotency/idempotency.service.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { reversedCommission } from '../ledger/ledger.rules.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { SellersService } from '../sellers/sellers.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';
import { toSellerOrderDto } from './order.mapper.js';
import { OrdersRepository } from './orders.repository.js';
import type { CreateRefundDto, SellerOrderDto } from './orders.dto.js';
import { assertPaid, calculateRefund } from './refund-rules.js';

export const FULLY_REFUNDED_REASON = 'fully_refunded';

const NOT_SHIPPED: SellerOrderStatus[] = [SellerOrderStatus.NEW, SellerOrderStatus.PROCESSING];

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly ledger: LedgerService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly sellers: SellersService,
    private readonly outbox: OutboxService,
  ) {}

  async issue(
    userId: string,
    sellerOrderId: string,
    idempotencyKey: string,
    dto: CreateRefundDto,
  ): Promise<IdempotentResult<SellerOrderDto>> {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    return this.idempotency.run(
      {
        userId,
        scope: IdempotencyScope.REFUND,
        key: idempotencyKey,
        payload: { sellerOrderId, ...dto },
      },
      async (tx) => ({
        status: HttpStatus.CREATED,
        body: await this.refund(tx, userId, sellerId, sellerOrderId, dto),
      }),
    );
  }

  private async refund(
    tx: Transaction,
    userId: string,
    sellerId: string,
    sellerOrderId: string,
    dto: CreateRefundDto,
  ): Promise<SellerOrderDto> {
    const owned = await this.orders.findOwnedSellerOrder(sellerOrderId, sellerId, tx);
    if (!owned) {
      throw new NotFoundException('Seller order not found');
    }
    await this.lifecycle.lockOrder(tx, owned.orderId);

    const sellerOrder = await this.orders.sellerOrderForSettlement(sellerOrderId, tx);
    if (sellerOrder.status === SellerOrderStatus.CANCELLED) {
      throw new ConflictException('A cancelled seller order cannot be refunded');
    }
    assertPaid(sellerOrder.order.paymentStatus);
    const item = sellerOrder.items.find((candidate) => candidate.id === dto.orderItemId);
    if (!item) {
      throw new NotFoundException('Order item not found in this seller order');
    }

    let calculation;
    try {
      calculation = calculateRefund(
        item,
        {
          ...sellerOrder,
          reversedCommissionMinor: reversedCommission(sellerOrder.refunds),
        },
        dto.quantity,
      );
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (!(await this.orders.refundItem(item, dto.quantity, tx))) {
      throw new ConflictException('The order item was refunded concurrently, reload and retry');
    }
    await this.orders.addRefunded(sellerOrderId, calculation.amountMinor, tx);

    const refund = await this.orders.createRefund(
      {
        sellerOrderId,
        orderItemId: item.id,
        quantity: dto.quantity,
        amountMinor: calculation.amountMinor,
        commissionReversalMinor: calculation.commissionReversalMinor,
        reason: dto.reason,
        createdById: userId,
      },
      tx,
    );
    await this.ledger.recordRefund(
      {
        sellerId,
        sellerOrderId,
        refundId: refund.id,
        amountMinor: calculation.amountMinor,
        commissionReversalMinor: calculation.commissionReversalMinor,
      },
      tx,
    );

    if (NOT_SHIPPED.includes(sellerOrder.status) || dto.restock === true) {
      await this.inventory.restock(item.productId, dto.quantity, tx);
      await this.outbox.add(tx, productChanged(item.productId, 'stock_changed'));
    }

    await this.lifecycle.refundBuyer(tx, {
      orderId: owned.orderId,
      sellerOrderId,
      refundId: refund.id,
      amountMinor: calculation.amountMinor,
      reason: dto.reason ?? 'refund',
    });

    const fullyRefunded =
      sellerOrder.refundedMinor + calculation.amountMinor >= sellerOrder.subtotalMinor;
    if (fullyRefunded && NOT_SHIPPED.includes(sellerOrder.status)) {
      await this.lifecycle.transition(
        tx,
        sellerOrderId,
        SellerOrderStatus.CANCELLED,
        FULLY_REFUNDED_REASON,
      );
    }

    this.logger.log(
      {
        refundId: refund.id,
        sellerOrderId,
        amountMinor: calculation.amountMinor.toString(),
        quantity: dto.quantity,
      },
      'Refund issued',
    );
    return toSellerOrderDto(await this.orders.getSellerOrder(sellerOrderId, tx));
  }
}
