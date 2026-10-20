import { BadRequestException, Injectable } from '@nestjs/common';
import {
  changePercent,
  fillDays,
  isoDay,
  type Period,
  previousPeriod,
  ratePercent,
  resolvePeriod,
  startOfUtcDay,
} from './analytics.rules.js';
import type { MoneyTotalsDto } from './analytics.dto.js';
import { AnalyticsRepository, type LedgerTotalsRow } from './analytics.repository.js';

export const EXPORT_COLUMNS = [
  'day',
  'sellerId',
  'storeName',
  'productId',
  'title',
  'ordersCount',
  'unitsSold',
  'grossMinor',
  'refundedMinor',
  'commissionMinor',
] as const;

const TOP_LIMIT = 5;

const toMoney = (row: LedgerTotalsRow): MoneyTotalsDto => ({
  grossMinor: Number(row.gross),
  refundedMinor: Number(row.refunded),
  commissionMinor: Number(row.commission),
  payoutMinor: Number(row.payout),
});

@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  period(from?: string, to?: string): Period {
    try {
      return resolvePeriod(from, to, new Date());
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async ledgerTotals(period: Period | null, sellerId?: string): Promise<MoneyTotalsDto> {
    return toMoney(await this.analytics.ledgerTotals(period, sellerId));
  }

  async summary(period: Period) {
    const [totals, ordersCount, sellers, topProducts, topSellers, conversion] = await Promise.all([
      this.ledgerTotals(period),
      this.analytics.paidOrdersCount(period),
      this.revenueBySeller(period),
      this.topProducts(period),
      this.topSellers(period),
      this.conversion(period),
    ]);
    return {
      period: { from: isoDay(period.from), to: isoDay(new Date(period.toExclusive.getTime() - 1)) },
      platformCommissionMinor: totals.commissionMinor,
      grossSalesMinor: totals.grossMinor,
      refundedMinor: totals.refundedMinor,
      ordersCount,
      sellers,
      topProducts,
      topSellers,
      conversion,
    };
  }

  async salesChart(days: number) {
    const today = startOfUtcDay(new Date());
    const current = this.period(
      isoDay(new Date(today.getTime() - (days - 1) * 86_400_000)),
      isoDay(today),
    );
    const previous = previousPeriod(current);
    const [currentRows, previousRows] = await Promise.all([
      this.daily(current),
      this.daily(previous),
    ]);
    const empty = (day: string) => ({ day, grossMinor: 0, refundedMinor: 0, ordersCount: 0 });
    const sum = (rows: { grossMinor: number; refundedMinor: number }[]) =>
      rows.reduce((total, row) => total + row.grossMinor - row.refundedMinor, 0);
    const currentNet = sum(currentRows);
    const previousNet = sum(previousRows);
    return {
      current: fillDays(currentRows, current, empty),
      previous: fillDays(previousRows, previous, empty),
      totals: {
        currentNetMinor: currentNet,
        previousNetMinor: previousNet,
        changePercent: changePercent(currentNet, previousNet),
      },
    };
  }

  async exportRows(period: Period) {
    const rows = await this.analytics.exportRows(period);
    return rows.map((row) => ({
      ...row,
      day: isoDay(row.day),
      grossMinor: Number(row.grossMinor),
      refundedMinor: Number(row.refundedMinor),
      commissionMinor: Number(row.commissionMinor),
    }));
  }

  private async revenueBySeller(period: Period) {
    const rows = await this.analytics.revenueBySeller(period);
    return rows.map((row) => ({
      sellerId: row.sellerId,
      storeName: row.storeName,
      ...toMoney(row),
    }));
  }

  private async topProducts(period: Period) {
    const rows = await this.analytics.topProducts(period, TOP_LIMIT);
    return rows.map((row) => ({ ...row, netMinor: Number(row.netMinor) }));
  }

  private async topSellers(period: Period) {
    const rows = await this.analytics.topSellers(period, TOP_LIMIT);
    return rows.map((row) => ({ ...row, netMinor: Number(row.netMinor) }));
  }

  private async conversion(period: Period) {
    const row = await this.analytics.conversion(period);
    return { ...row, ratePercent: ratePercent(row.buyers, row.cartUsers) };
  }

  private async daily(period: Period) {
    const [sales, orders] = await Promise.all([
      this.analytics.dailySales(period),
      this.analytics.dailyPaidOrders(period),
    ]);
    const ordersByDay = new Map(orders.map((row) => [isoDay(row.day), row.count]));
    return sales.map((row) => ({
      day: isoDay(row.day),
      grossMinor: Number(row.grossMinor),
      refundedMinor: Number(row.refundedMinor),
      ordersCount: ordersByDay.get(isoDay(row.day)) ?? 0,
    }));
  }
}
