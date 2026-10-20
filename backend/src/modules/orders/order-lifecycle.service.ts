import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  productChanged,
  refundRequested,
  sellerOrderStatusChanged,
} from '../../common/events/domain-events.js';
import { type OrderStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { openCommission } from '../ledger/ledger.rules.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { aggregateOrderStatus, canTransition } from './order-status.js';
import { OrdersRepository } from './orders.repository.js';
import { paymentStatusAfterRefund, REFUNDABLE_PAYMENT_STATUSES } from './refund-rules.js';

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
    allowedFrom?: SellerOrderStatus[],
  ): Promise<TransitionResult> {
    const orderId = await this.orders.orderIdOf(sellerOrderId, tx);
    await this.lockOrder(tx, orderId);

    const current = await this.orders.sellerOrderState(sellerOrderId, tx);
    if (allowedFrom && !allowedFrom.includes(current.status)) {
      throw new ConflictException(`Seller order is already ${current.status}`);
    }
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

  async cancel(
    tx: Transaction,
    sellerOrderId: string,
    reason: string,
    allowedFrom?: SellerOrderStatus[],
  ): Promise<TransitionResult> {
    const result = await this.transition(
      tx,
      sellerOrderId,
      SellerOrderStatus.CANCELLED,
      reason,
      allowedFrom,
    );

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

    const openSubtotal = sellerOrder.subtotalMinor - sellerOrder.refundedMinor;
    await this.ledger.recordCancellation(
      {
        sellerId: sellerOrder.sellerId,
        sellerOrderId,
        openSubtotalMinor: openSubtotal,
        openCommissionMinor: openCommission(sellerOrder),
      },
      tx,
    );

    if (openSubtotal > 0n) {
      const refunded = await this.refundBuyer(tx, {
        orderId: result.orderId,
        sellerOrderId,
        refundId: null,
        amountMinor: openSubtotal,
        reason,
      });
      if (refunded) {
        await this.orders.markFullyRefunded(sellerOrderId, sellerOrder.subtotalMinor, tx);
      }
    }

    return result;
  }

  async refundBuyer(
    tx: Transaction,
    refund: {
      orderId: string;
      sellerOrderId: string;
      refundId: string | null;
      amountMinor: bigint;
      reason: string;
    },
  ) {
    const order = await this.orders.findWithPayment(refund.orderId, tx);
    if (!order.payment || !REFUNDABLE_PAYMENT_STATUSES.includes(order.payment.status)) {
      return false;
    }

    const refundedMinor = order.refundedMinor + refund.amountMinor;
    const paymentStatus = paymentStatusAfterRefund(order.payment.amountMinor, refundedMinor);
    await this.orders.applyRefund(order.id, refundedMinor, paymentStatus, tx);
    await this.outbox.add(
      tx,
      refundRequested({
        orderId: order.id,
        buyerId: order.buyerId,
        sellerOrderId: refund.sellerOrderId,
        refundId: refund.refundId,
        amountMinor: refund.amountMinor.toString(),
        reason: refund.reason,
      }),
    );
    return true;
  }
}
