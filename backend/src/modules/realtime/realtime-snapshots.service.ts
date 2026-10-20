import { Injectable } from '@nestjs/common';
import { maskBidder, minNextBid } from '../auctions/auction.rules.js';
import { VIEWABLE_STATUSES } from '../products/catalog.service.js';
import { RealtimeSnapshotsRepository } from './realtime-snapshots.repository.js';
import type {
  AuctionUpdate,
  OrderUpdate,
  ProductUpdate,
  SellerOrderUpdate,
} from './realtime.types.js';

@Injectable()
export class RealtimeSnapshotsService {
  constructor(private readonly snapshots: RealtimeSnapshotsRepository) {}

  async product(productId: string, onlyViewable = false): Promise<ProductUpdate | null> {
    const product = await this.snapshots.product(productId);
    if (!product || (onlyViewable && !VIEWABLE_STATUSES.includes(product.status))) {
      return null;
    }
    return {
      productId: product.id,
      version: product.version,
      status: product.status,
      stock: product.stock,
      inStock: product.stock > 0,
      priceMinor: product.priceMinor,
    };
  }

  async auction(productId: string, onlyViewable = false): Promise<AuctionUpdate | null> {
    const auction = await this.snapshots.auction(productId);
    if (!auction || (onlyViewable && !VIEWABLE_STATUSES.includes(auction.product.status))) {
      return null;
    }
    return {
      productId,
      auctionId: auction.id,
      version: auction.version,
      status: auction.status,
      currentPriceMinor: auction.currentPriceMinor,
      minNextBidMinor: minNextBid(auction),
      bidCount: auction.bidCount,
      leader: auction.leader ? maskBidder(auction.leader.name) : null,
      endsAt: auction.endsAt.toISOString(),
      checkoutDeadline: auction.checkoutDeadline?.toISOString() ?? null,
    };
  }

  async order(orderId: string): Promise<{ buyerId: string; update: OrderUpdate } | null> {
    const order = await this.snapshots.order(orderId);
    if (!order) {
      return null;
    }
    return {
      buyerId: order.buyerId,
      update: {
        orderId: order.id,
        version: order.version,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalMinor: Number(order.totalMinor),
        refundedMinor: Number(order.refundedMinor),
        sellerOrders: order.sellerOrders,
      },
    };
  }

  async sellerOrders(
    orderId: string,
  ): Promise<{ sellerUserId: string; update: SellerOrderUpdate }[]> {
    const sellerOrders = await this.snapshots.sellerOrders(orderId);
    return sellerOrders.map((sellerOrder) => ({
      sellerUserId: sellerOrder.seller.userId,
      update: {
        sellerOrderId: sellerOrder.id,
        orderId,
        version: sellerOrder.version,
        status: sellerOrder.status,
        paymentStatus: sellerOrder.order.paymentStatus,
        refundedMinor: Number(sellerOrder.refundedMinor),
      },
    }));
  }
}
