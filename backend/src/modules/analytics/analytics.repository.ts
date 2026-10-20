import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuctionStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';
import type { Period } from './analytics.rules.js';

const PAID_STATUSES = Prisma.sql`('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')`;

const LEDGER_TOTALS = Prisma.sql`
  COALESCE(SUM(l.amount_minor) FILTER (WHERE l.type = 'SALE'), 0)::bigint AS gross,
  COALESCE(-SUM(l.amount_minor) FILTER (WHERE l.type IN ('REFUND', 'CANCELLATION')), 0)::bigint AS refunded,
  COALESCE(-SUM(l.amount_minor) FILTER (
    WHERE l.type IN ('COMMISSION', 'COMMISSION_REVERSAL', 'COMMISSION_CANCELLATION')), 0)::bigint AS commission,
  COALESCE(SUM(l.amount_minor) FILTER (WHERE l.type <> 'PAYOUT'), 0)::bigint AS payout`;

const PAID_LEDGER_JOIN = Prisma.sql`
  LEFT JOIN seller_orders so ON so.id = l.seller_order_id
  LEFT JOIN orders o ON o.id = so.order_id`;

const PAID_LEDGER_FILTER = Prisma.sql`(l.seller_order_id IS NULL OR o.payment_status IN ${PAID_STATUSES})`;

export interface LedgerTotalsRow {
  gross: bigint;
  refunded: bigint;
  commission: bigint;
  payout: bigint;
}

export interface ExportRow {
  day: Date;
  sellerId: string;
  storeName: string;
  productId: string;
  title: string;
  ordersCount: number;
  unitsSold: number;
  grossMinor: bigint;
  refundedMinor: bigint;
  commissionMinor: bigint;
}

@Injectable()
export class AnalyticsRepository extends PrismaRepository {
  async ledgerTotals(period: Period | null, sellerId?: string) {
    const conditions = [
      PAID_LEDGER_FILTER,
      period && Prisma.sql`l.created_at >= ${period.from} AND l.created_at < ${period.toExclusive}`,
      sellerId && Prisma.sql`l.seller_id = ${sellerId}::uuid`,
    ].filter((c): c is Prisma.Sql => Boolean(c));
    const [row] = await this.prisma.$queryRaw<LedgerTotalsRow[]>`
      SELECT ${LEDGER_TOTALS}
      FROM ledger_entries l ${PAID_LEDGER_JOIN}
      WHERE ${Prisma.join(conditions, ' AND ')}`;
    return row;
  }

  revenueBySeller(period: Period) {
    return this.prisma.$queryRaw<(LedgerTotalsRow & { sellerId: string; storeName: string })[]>`
      SELECT l.seller_id AS "sellerId", s.store_name AS "storeName", ${LEDGER_TOTALS}
      FROM ledger_entries l JOIN sellers s ON s.id = l.seller_id ${PAID_LEDGER_JOIN}
      WHERE ${PAID_LEDGER_FILTER}
        AND l.created_at >= ${period.from} AND l.created_at < ${period.toExclusive}
      GROUP BY l.seller_id, s.store_name
      ORDER BY payout DESC`;
  }

  async paidOrdersCount(period: Period) {
    const [{ count }] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM orders
      WHERE payment_status IN ${PAID_STATUSES}
        AND created_at >= ${period.from} AND created_at < ${period.toExclusive}`;
    return count;
  }

  topProducts(period: Period, take: number) {
    return this.prisma.$queryRaw<
      { productId: string; title: string; storeName: string; unitsSold: number; netMinor: bigint }[]
    >`
      SELECT sd.product_id AS "productId", p.title, s.store_name AS "storeName",
             SUM(sd.units_sold)::int AS "unitsSold",
             SUM(sd.gross_minor - sd.refunded_minor)::bigint AS "netMinor"
      FROM sales_daily sd
      JOIN products p ON p.id = sd.product_id
      JOIN sellers s ON s.id = sd.seller_id
      WHERE sd.day >= ${period.from}::date AND sd.day < ${period.toExclusive}::date
      GROUP BY sd.product_id, p.title, s.store_name
      ORDER BY "netMinor" DESC, "unitsSold" DESC
      LIMIT ${take}`;
  }

  topSellers(period: Period, take: number) {
    return this.prisma.$queryRaw<
      { sellerId: string; storeName: string; ordersCount: number; netMinor: bigint }[]
    >`
      SELECT sd.seller_id AS "sellerId", s.store_name AS "storeName",
             (SELECT COUNT(*)::int FROM seller_orders so JOIN orders o ON o.id = so.order_id
              WHERE so.seller_id = sd.seller_id AND o.payment_status IN ${PAID_STATUSES}
                AND o.created_at >= ${period.from} AND o.created_at < ${period.toExclusive}
             ) AS "ordersCount",
             SUM(sd.gross_minor - sd.refunded_minor)::bigint AS "netMinor"
      FROM sales_daily sd JOIN sellers s ON s.id = sd.seller_id
      WHERE sd.day >= ${period.from}::date AND sd.day < ${period.toExclusive}::date
      GROUP BY sd.seller_id, s.store_name
      ORDER BY "netMinor" DESC
      LIMIT ${take}`;
  }

  async conversion(period: Period) {
    const [row] = await this.prisma.$queryRaw<{ cartUsers: number; buyers: number }[]>`
      SELECT COUNT(DISTINCT ca.user_id)::int AS "cartUsers",
             COUNT(DISTINCT ca.user_id) FILTER (WHERE EXISTS (
               SELECT 1 FROM orders o
               WHERE o.buyer_id = ca.user_id
                 AND o.payment_status IN ${PAID_STATUSES}
                 AND o.created_at >= ${period.from} AND o.created_at < ${period.toExclusive}
             ))::int AS buyers
      FROM cart_activity ca
      WHERE ca.day >= ${period.from}::date AND ca.day < ${period.toExclusive}::date`;
    return row;
  }

  dailySales(period: Period) {
    return this.prisma.$queryRaw<{ day: Date; grossMinor: bigint; refundedMinor: bigint }[]>`
      SELECT day, SUM(gross_minor)::bigint AS "grossMinor",
             SUM(refunded_minor)::bigint AS "refundedMinor"
      FROM sales_daily
      WHERE day >= ${period.from}::date AND day < ${period.toExclusive}::date
      GROUP BY day ORDER BY day`;
  }

  dailyPaidOrders(period: Period) {
    return this.prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS count
      FROM orders
      WHERE payment_status IN ${PAID_STATUSES}
        AND created_at >= ${period.from} AND created_at < ${period.toExclusive}
      GROUP BY 1`;
  }

  exportRows(period: Period) {
    return this.prisma.$queryRaw<ExportRow[]>`
      SELECT sd.day, sd.seller_id AS "sellerId", s.store_name AS "storeName",
             sd.product_id AS "productId", p.title, sd.orders_count AS "ordersCount",
             sd.units_sold AS "unitsSold", sd.gross_minor AS "grossMinor",
             sd.refunded_minor AS "refundedMinor", sd.commission_minor AS "commissionMinor"
      FROM sales_daily sd
      JOIN sellers s ON s.id = sd.seller_id
      JOIN products p ON p.id = sd.product_id
      WHERE sd.day >= ${period.from}::date AND sd.day < ${period.toExclusive}::date
      ORDER BY sd.day, s.store_name, p.title`;
  }

  async sellerOrderStatusCounts(sellerId: string) {
    const rows = await this.prisma.sellerOrder.groupBy({
      by: ['status'],
      where: { sellerId },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  runningAuctions(sellerId: string) {
    return this.prisma.auction.findMany({
      where: {
        product: { sellerId },
        status: { in: [AuctionStatus.ACTIVE, AuctionStatus.AWAITING_CHECKOUT] },
      },
      include: { product: { select: { title: true } } },
      orderBy: { endsAt: 'asc' },
    });
  }

  recentSellerOrders(sellerId: string, take: number) {
    return this.prisma.sellerOrder.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, orderId: true, status: true, subtotalMinor: true, createdAt: true },
    });
  }
}
