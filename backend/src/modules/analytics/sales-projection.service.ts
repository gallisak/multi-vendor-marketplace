import { Injectable } from '@nestjs/common';
import type { DomainEventPayloads } from '../../common/events/domain-events.js';
import { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import { openCommission } from '../ledger/ledger.rules.js';
import { lineTotal } from '../orders/pricing.js';
import { startOfUtcDay } from './analytics.rules.js';
import { SalesDailyRepository } from './sales-daily.repository.js';

export function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0n);
  if (sum === 0n) {
    return weights.map(() => 0n);
  }
  let given = 0n;
  return weights.map((weight, index) => {
    const share = index === weights.length - 1 ? total - given : (total * weight) / sum;
    given += share;
    return share;
  });
}

@Injectable()
export class SalesProjectionService {
  constructor(
    private readonly idempotent: IdempotentConsumerService,
    private readonly sales: SalesDailyRepository,
  ) {}

  recordPayment(eventId: string, orderId: string) {
    return this.idempotent.runOnce('analytics', eventId, async (tx) => {
      const order = await this.sales.paidOrder(orderId, tx);
      const day = startOfUtcDay(order.createdAt);
      for (const sellerOrder of order.sellerOrders) {
        const grosses = sellerOrder.items.map((item) => lineTotal(item));
        const commissions = allocate(sellerOrder.commissionMinor, grosses);
        for (const [index, item] of sellerOrder.items.entries()) {
          await this.sales.apply(
            {
              day,
              sellerId: sellerOrder.sellerId,
              productId: item.productId,
              ordersCount: 1,
              unitsSold: item.quantity,
              grossMinor: grosses[index],
              commissionMinor: commissions[index],
            },
            tx,
          );
        }
      }
    });
  }

  recordRefund(eventId: string, refund: DomainEventPayloads['payment.refund_requested']) {
    return this.idempotent.runOnce('analytics', eventId, async (tx) => {
      const sellerOrder = await this.sales.refundedSellerOrder(refund.sellerOrderId, tx);
      const day = startOfUtcDay(sellerOrder.order.createdAt);

      if (refund.refundId) {
        const row = await this.sales.refund(refund.refundId, tx);
        await this.sales.apply(
          {
            day,
            sellerId: sellerOrder.sellerId,
            productId: row.orderItem.productId,
            refundedMinor: row.amountMinor,
            commissionMinor: -row.commissionReversalMinor,
          },
          tx,
        );
        return;
      }

      const lines = sellerOrder.items
        .map((item) => ({
          productId: item.productId,
          remaining: lineTotal({
            unitPriceMinor: item.unitPriceMinor,
            quantity: item.quantity - item.refundedQuantity,
          }),
        }))
        .filter((line) => line.remaining > 0n);
      const shares = allocate(
        openCommission(sellerOrder),
        lines.map((line) => line.remaining),
      );
      for (const [index, line] of lines.entries()) {
        await this.sales.apply(
          {
            day,
            sellerId: sellerOrder.sellerId,
            productId: line.productId,
            refundedMinor: line.remaining,
            commissionMinor: -shares[index],
          },
          tx,
        );
      }
    });
  }
}
