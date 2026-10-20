import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export interface SalesDelta {
  day: Date;
  sellerId: string;
  productId: string;
  ordersCount?: number;
  unitsSold?: number;
  grossMinor?: bigint;
  commissionMinor?: bigint;
  refundedMinor?: bigint;
}

@Injectable()
export class SalesDailyRepository extends PrismaRepository {
  paidOrder(orderId: string, tx: Transaction) {
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { sellerOrders: { include: { items: true } } },
    });
  }

  refundedSellerOrder(sellerOrderId: string, tx: Transaction) {
    return tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      include: {
        items: true,
        refunds: { select: { commissionReversalMinor: true } },
        order: { select: { createdAt: true } },
      },
    });
  }

  refund(refundId: string, tx: Transaction) {
    return tx.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { orderItem: { select: { productId: true } } },
    });
  }

  async apply(delta: SalesDelta, tx: Transaction) {
    await tx.$executeRaw`
      INSERT INTO sales_daily (day, seller_id, product_id, orders_count, units_sold,
                               gross_minor, commission_minor, refunded_minor)
      VALUES (${delta.day}::date, ${delta.sellerId}::uuid, ${delta.productId}::uuid,
              ${delta.ordersCount ?? 0}, ${delta.unitsSold ?? 0}, ${delta.grossMinor ?? 0n},
              ${delta.commissionMinor ?? 0n}, ${delta.refundedMinor ?? 0n})
      ON CONFLICT (day, seller_id, product_id) DO UPDATE SET
        orders_count = sales_daily.orders_count + EXCLUDED.orders_count,
        units_sold = sales_daily.units_sold + EXCLUDED.units_sold,
        gross_minor = sales_daily.gross_minor + EXCLUDED.gross_minor,
        commission_minor = sales_daily.commission_minor + EXCLUDED.commission_minor,
        refunded_minor = sales_daily.refunded_minor + EXCLUDED.refunded_minor`;
  }
}
