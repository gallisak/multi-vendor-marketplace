import { Injectable } from '@nestjs/common';
import { auctionRelisted, productChanged } from '../../common/events/domain-events.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { relistedWindow } from './auction.rules.js';
import { AuctionsRepository } from './auctions.repository.js';

export type RelistReason = 'checkout_expired' | 'order_cancelled';

@Injectable()
export class AuctionRelistService {
  constructor(
    private readonly auctions: AuctionsRepository,
    private readonly outbox: OutboxService,
  ) {}

  async relist(auctionId: string, reason: RelistReason, tx: Transaction) {
    const auction = await this.auctions.findWithOwner(auctionId, tx);
    const window = relistedWindow(auction.startsAt, auction.endsAt, await this.auctions.now(tx));

    await this.auctions.relist(
      { auctionId, productId: auction.productId, startPriceMinor: auction.startPriceMinor },
      window,
      tx,
    );
    await this.outbox.add(
      tx,
      auctionRelisted({
        auctionId,
        productId: auction.productId,
        title: auction.product.title,
        sellerUserId: auction.product.seller.userId,
        previousWinnerId: auction.winnerId,
        endsAt: window.endsAt.toISOString(),
        reason,
      }),
      productChanged(auction.productId, 'auction_relisted'),
    );
    return { productId: auction.productId, endsAt: window.endsAt };
  }
}
