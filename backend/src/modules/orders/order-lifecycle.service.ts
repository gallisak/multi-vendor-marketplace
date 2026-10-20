import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { productChanged, sellerOrderStatusChanged } from '../../common/events/domain-events.js';
import { type OrderStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { openCommission } from '../ledger/ledger.rules.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { aggregateOrderStatus, canTransition } from './order-status.js';
import { OrdersRepository } from './orders.repository.js';

export interface TransitionResult {
  sellerOrderId: string;
  orderId: string;
  from: SellerOrderStatus;
  to: SellerOrderStatus;
  orderStatus: OrderStatus;
}

@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
  ) {}

  async lockOrder(tx: Transaction, orderId: string) {
    if (!(await this.orders.lock(orderId, tx))) {
      throw new NotFoundException('Order not found');
    }
  }

  async transition(
    tx: Transaction,
    sellerOrderId: string,
    to: SellerOrderStatus,
    reason: string | null = null,
  ): Promise<TransitionResult> {
    const orderId = await this.orders.orderIdOf(sellerOrderId, tx);
    await this.lockOrder(tx, orderId);

    const current = await this.orders.sellerOrderState(sellerOrderId, tx);
    if (!canTransition(current.status, to)) {
      throw new ConflictException(`Seller order cannot move from ${current.status} to ${to}`);
    }
    if (!(await this.orders.moveSellerOrder(sellerOrderId, current.status, to, reason, tx))) {
      throw new ConflictException('Seller order was modified concurrently, reload and retry');
    }

    const orderStatus = aggregateOrderStatus(await this.orders.sellerOrderStatuses(orderId, tx));
    await this.orders.setStatus(orderId, orderStatus, tx);
    await this.outbox.add(
      tx,
      sellerOrderStatusChanged({
        sellerOrderId,
        orderId,
        sellerId: current.sellerId,
        buyerId: current.order.buyerId,
        from: current.status,
        to,
        orderStatus,
        reason,
      }),
    );
    this.logger.log(
      { sellerOrderId, orderId, from: current.status, to, orderStatus, reason },
      'Seller order status changed',
    );
    return { sellerOrderId, orderId, from: current.status, to, orderStatus };
  }

  async cancel(tx: Transaction, sellerOrderId: string, reason: string): Promise<TransitionResult> {
    const result = await this.transition(tx, sellerOrderId, SellerOrderStatus.CANCELLED, reason);

    const sellerOrder = await this.orders.sellerOrderForSettlement(sellerOrderId, tx);
    for (const item of sellerOrder.items) {
      const quantity = item.quantity - item.refundedQuantity;
      if (quantity > 0) {
        await this.inventory.restock(item.productId, quantity, tx);
      }
    }
    await this.outbox.add(
      tx,
      ...sellerOrder.items.map((item) => productChanged(item.productId, 'stock_changed')),
    );

    await this.ledger.recordCancellation(
      {
        sellerId: sellerOrder.sellerId,
        sellerOrderId,
        openSubtotalMinor: sellerOrder.subtotalMinor - sellerOrder.refundedMinor,
        openCommissionMinor: openCommission(sellerOrder),
      },
      tx,
    );

    return result;
  }
}
