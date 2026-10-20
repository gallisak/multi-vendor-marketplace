import { Injectable } from '@nestjs/common';
import { minNextBid } from '../auctions/auction.rules.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { SellersService } from '../sellers/sellers.service.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { AnalyticsService } from './analytics.service.js';

const RECENT_ORDERS = 5;

@Injectable()
export class SellerDashboardService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly sellers: SellersService,
    private readonly analytics: AnalyticsService,
    private readonly ledger: LedgerService,
  ) {}

  async dashboard(userId: string) {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    const [last30Days, allTime, payouts, statusCounts, auctions, recentOrders] = await Promise.all([
      this.analytics.ledgerTotals(this.analytics.period(), sellerId),
      this.analytics.ledgerTotals(null, sellerId),
      this.ledger.balance(sellerId),
      this.repository.sellerOrderStatusCounts(sellerId),
      this.repository.runningAuctions(sellerId),
      this.repository.recentSellerOrders(sellerId, RECENT_ORDERS),
    ]);

    return {
      revenue: { last30Days, allTime },
      payouts,
      sellerOrders: Object.fromEntries(statusCounts.map((row) => [row.status, row.count])),
      auctions: auctions.map((auction) => ({
        productId: auction.productId,
        title: auction.product.title,
        status: auction.status,
        currentPriceMinor: auction.currentPriceMinor,
        minNextBidMinor: minNextBid(auction),
        bidCount: auction.bidCount,
        endsAt: auction.endsAt,
        checkoutDeadline: auction.checkoutDeadline,
      })),
      recentOrders: recentOrders.map((order) => ({
        ...order,
        subtotalMinor: Number(order.subtotalMinor),
      })),
    };
  }
}
