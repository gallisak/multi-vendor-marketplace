import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { bidPlaced, productChanged } from '../../common/events/domain-events.js';
import { IdempotencyScope } from '../../generated/prisma/enums.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../../infra/idempotency/idempotency.service.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { VIEWABLE_STATUSES } from '../products/catalog.service.js';
import { type BidRejection, bidRejection, maskBidder, minNextBid } from './auction.rules.js';
import type { AuctionViewDto, BidResultDto } from './auctions.dto.js';
import { AuctionsRepository } from './auctions.repository.js';

export const MAX_BID_ATTEMPTS = 5;
const RECENT_BIDS = 20;

function rejectionError(rejection: BidRejection) {
  switch (rejection.code) {
    case 'NOT_ACTIVE':
      return new ConflictException('This auction is not accepting bids');
    case 'ENDED':
      return new ConflictException('The auction has ended');
    case 'OWN_LOT':
      return new BadRequestException('You cannot bid on your own lot');
    case 'ALREADY_LEADING':
      return new ConflictException('You are already the highest bidder');
    case 'TOO_LOW':
      return new ConflictException(`Bid must be at least ${rejection.minimumMinor}`);
  }
}

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    private readonly auctions: AuctionsRepository,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    @InjectMetric(METRIC.bids) private readonly bids: Counter<string>,
  ) {}

  async placeBid(
    bidderId: string,
    productId: string,
    idempotencyKey: string,
    amountMinor: number,
  ): Promise<IdempotentResult<BidResultDto>> {
    try {
      const result = await this.idempotency.run(
        {
          userId: bidderId,
          scope: IdempotencyScope.BID,
          key: idempotencyKey,
          payload: { productId, amountMinor },
        },
        async (tx) => ({
          status: HttpStatus.CREATED,
          body: await this.bid(tx, bidderId, productId, amountMinor),
        }),
      );
      if (!result.replayed) {
        this.bids.inc({ result: 'accepted' });
      }
      return result;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        this.bids.inc({ result: 'rejected' });
      }
      throw error;
    }
  }

  async view(productId: string, viewerId?: string): Promise<AuctionViewDto> {
    const auction = await this.auctions.findView(productId);
    if (!auction || !VIEWABLE_STATUSES.includes(auction.product.status)) {
      throw new NotFoundException('Auction not found');
    }
    const [recentBids, now] = await Promise.all([
      this.auctions.recentBids(auction.id, auction.startsAt, RECENT_BIDS),
      this.auctions.now(),
    ]);

    return {
      auctionId: auction.id,
      productId,
      title: auction.product.title,
      status: auction.status,
      startPriceMinor: auction.startPriceMinor,
      bidStepMinor: auction.bidStepMinor,
      currentPriceMinor: auction.currentPriceMinor,
      minNextBidMinor: minNextBid(auction),
      bidCount: auction.bidCount,
      leader: auction.leader ? maskBidder(auction.leader.name) : null,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      checkoutDeadline: auction.checkoutDeadline,
      recentBids: recentBids.map((bid) => ({
        amountMinor: bid.amountMinor,
        bidder: maskBidder(bid.bidder.name),
        createdAt: bid.createdAt,
      })),
      serverTime: now,
      viewer: viewerId
        ? {
            isSeller: auction.product.seller.userId === viewerId,
            isLeader: auction.leaderId === viewerId,
            isWinner: auction.winnerId === viewerId,
          }
        : null,
    };
  }

  private async bid(
    tx: Transaction,
    bidderId: string,
    productId: string,
    amountMinor: number,
  ): Promise<BidResultDto> {
    for (let attempt = 1; attempt <= MAX_BID_ATTEMPTS; attempt++) {
      const auction = await this.auctions.findForBidding(productId, tx);
      if (!auction || !VIEWABLE_STATUSES.includes(auction.product.status)) {
        throw new NotFoundException('Auction not found');
      }

      const now = await this.auctions.now(tx);
      const rejection = bidRejection(
        { ...auction, sellerUserId: auction.product.seller.userId },
        bidderId,
        amountMinor,
        now,
      );
      if (rejection) {
        throw rejectionError(rejection);
      }

      const updated = await this.auctions.applyBid(
        { auctionId: auction.id, version: auction.version, bidderId, amountMinor },
        tx,
      );
      if (!updated) {
        this.bids.inc({ result: 'version_conflict' });
        continue;
      }

      await this.auctions.recordBid(
        { auctionId: auction.id, productId, bidderId, amountMinor },
        tx,
      );

      const nextMinimum = amountMinor + auction.bidStepMinor;
      await this.outbox.add(
        tx,
        bidPlaced({
          auctionId: auction.id,
          productId,
          bidderId,
          previousLeaderId: auction.leaderId,
          amountMinor,
          bidCount: updated.bidCount,
          minNextBidMinor: nextMinimum,
          endsAt: updated.endsAt.toISOString(),
        }),
        productChanged(productId, 'bid_placed'),
      );
      this.logger.log(
        { auctionId: auction.id, productId, bidderId, amountMinor, attempt },
        'Bid accepted',
      );
      return {
        auctionId: auction.id,
        productId,
        amountMinor,
        bidCount: updated.bidCount,
        minNextBidMinor: nextMinimum,
        endsAt: updated.endsAt,
      };
    }
    throw new ConflictException('The auction is too busy right now, retry your bid');
  }
}
