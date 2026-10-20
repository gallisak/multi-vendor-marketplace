import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { setTimeout as sleep } from 'node:timers/promises';
import { durationToSeconds } from '../../common/duration.js';
import { auctionClosed, productChanged } from '../../common/events/domain-events.js';
import { AuctionStatus, ProductStatus } from '../../generated/prisma/enums.js';
import type { Env } from '../../infra/config/env.schema.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { AuctionRelistService } from './auction-relist.service.js';
import { AuctionsRepository } from './auctions.repository.js';

const BATCH = 50;

@Injectable()
export class AuctionSweeperService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AuctionSweeperService.name);
  private readonly stop = new AbortController();
  private readonly checkoutWindowMs: number;
  private loop?: Promise<void>;

  constructor(
    private readonly auctions: AuctionsRepository,
    private readonly relisting: AuctionRelistService,
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService<Env, true>,
    @InjectMetric(METRIC.auctionsClosed) private readonly closed: Counter<string>,
  ) {
    this.checkoutWindowMs =
      durationToSeconds(config.get('AUCTION_CHECKOUT_WINDOW', { infer: true })) * 1000;
  }

  onApplicationBootstrap() {
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.stop.abort();
    await this.loop;
  }

  async sweep() {
    const due = await this.auctions.dueToClose(BATCH);
    const expired = await this.auctions.dueToRelist(BATCH);

    let closed = 0;
    for (const id of due) {
      closed += Number(await this.inTransaction(id, (tx) => this.close(tx, id)));
    }
    let relisted = 0;
    for (const id of expired) {
      relisted += Number(await this.inTransaction(id, (tx) => this.relist(tx, id)));
    }
    return { closed, relisted };
  }

  private async inTransaction(auctionId: string, work: (tx: Transaction) => Promise<boolean>) {
    try {
      return await this.uow.run(work);
    } catch (error) {
      this.logger.warn({ err: error, auctionId }, 'Could not settle auction, will retry');
      return false;
    }
  }

  private async close(tx: Transaction, auctionId: string) {
    const now = await this.auctions.lockDueToClose(auctionId, tx);
    if (!now) {
      return false;
    }
    const auction = await this.auctions.findWithOwner(auctionId, tx);
    const listed = auction.product.status === ProductStatus.ACTIVE;
    const won = auction.bidCount > 0 && auction.leaderId !== null;

    if (!won && !listed) {
      await this.auctions.setStatus(auctionId, AuctionStatus.CANCELLED, tx);
      this.closed.inc({ outcome: 'cancelled' });
      this.logger.log(
        { auctionId, productStatus: auction.product.status },
        'Auction of an unlisted product cancelled',
      );
      return true;
    }

    const checkoutDeadline = won ? new Date(now.getTime() + this.checkoutWindowMs) : null;
    if (won) {
      await this.auctions.markWon(auctionId, auction.leaderId!, checkoutDeadline!, tx);
    } else {
      await this.auctions.setStatus(auctionId, AuctionStatus.UNSOLD, tx);
    }
    if (listed) {
      await this.auctions.markLotSoldOut(auction.productId, tx);
    }
    await this.outbox.add(
      tx,
      auctionClosed({
        auctionId,
        productId: auction.productId,
        title: auction.product.title,
        sellerUserId: auction.product.seller.userId,
        outcome: won ? 'won' : 'unsold',
        winnerId: won ? auction.leaderId : null,
        amountMinor: won ? auction.currentPriceMinor : null,
        checkoutDeadline: checkoutDeadline?.toISOString() ?? null,
      }),
      productChanged(auction.productId, 'auction_closed'),
    );
    this.closed.inc({ outcome: won ? 'won' : 'unsold' });
    this.logger.log(
      { auctionId, productId: auction.productId, outcome: won ? 'won' : 'unsold' },
      'Auction closed',
    );
    return true;
  }

  private async relist(tx: Transaction, auctionId: string) {
    if (!(await this.auctions.lockDueToRelist(auctionId, tx))) {
      return false;
    }
    const { productId } = await this.relisting.relist(auctionId, 'checkout_expired', tx);
    this.closed.inc({ outcome: 'relisted' });
    this.logger.log({ auctionId, productId }, 'Auction relisted');
    return true;
  }

  private async run() {
    const interval = this.config.get('AUCTION_SWEEP_INTERVAL_MS', { infer: true });
    while (!this.stop.signal.aborted) {
      try {
        await this.sweep();
      } catch (error) {
        this.logger.warn({ err: error }, 'Auction sweep failed');
      }
      await sleep(interval, undefined, { signal: this.stop.signal }).catch(() => undefined);
    }
  }
}
