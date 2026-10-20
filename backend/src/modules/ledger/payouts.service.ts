import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { payoutPaid } from '../../common/events/domain-events.js';
import { PaginationQueryDto, toPage, toSkipTake } from '../../common/pagination.js';
import { LedgerEntryType } from '../../generated/prisma/enums.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { LedgerRepository } from './ledger.repository.js';
import { payoutAmount } from './ledger.rules.js';
import { LedgerService } from './ledger.service.js';
import type { PayoutDto, PayoutsQueryDto } from './payouts.dto.js';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway.js';

type PayoutRow = Awaited<ReturnType<LedgerRepository['findPayoutPage']>>[0][number];

const toDto = (payout: PayoutRow): PayoutDto => ({
  id: payout.id,
  sellerId: payout.sellerId,
  storeName: payout.seller.storeName,
  amountMinor: Number(payout.amountMinor),
  entriesSettled: payout._count.entries,
  providerRef: payout.providerRef,
  createdAt: payout.createdAt,
});

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly ledger: LedgerRepository,
    private readonly ledgerService: LedgerService,
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxService,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
    @InjectMetric(METRIC.payouts) private readonly payouts: Counter<string>,
  ) {}

  async payDue(cutoff: Date) {
    let paid = 0;
    for (const sellerId of await this.ledger.sellersDueForPayout(cutoff)) {
      try {
        paid += Number(await this.uow.run((tx) => this.paySeller(sellerId, cutoff, tx)));
      } catch (error) {
        this.logger.warn({ err: error, sellerId }, 'Payout failed, will retry');
      }
    }
    return paid;
  }

  async forSeller(sellerId: string, query: PaginationQueryDto) {
    const [balance, page] = await Promise.all([
      this.ledgerService.balance(sellerId),
      this.list({ ...query, sellerId }),
    ]);
    return { ...balance, ...page };
  }

  async list(query: PayoutsQueryDto) {
    const [items, total] = await this.ledger.findPayoutPage(query.sellerId, toSkipTake(query));
    return toPage(items.map(toDto), total, query);
  }

  private async paySeller(sellerId: string, cutoff: Date, tx: Transaction) {
    const seller = await this.ledger.lockSeller(sellerId, tx);
    if (!seller) {
      return false;
    }
    const entries = await this.ledger.unsettledDue(sellerId, cutoff, tx);
    const amountMinor = payoutAmount(entries);
    if (amountMinor <= 0n) {
      return false;
    }

    const { providerRef } = await this.gateway.transfer({
      idempotencyKey: entries[0].id,
      sellerId,
      amountMinor,
    });
    const payout = await this.ledger.createPayout({ sellerId, amountMinor, providerRef }, tx);
    await this.ledger.settle(
      entries.map((entry) => entry.id),
      payout.id,
      tx,
    );
    await this.ledger.add(
      { sellerId, payoutId: payout.id },
      [{ type: LedgerEntryType.PAYOUT, amountMinor: -amountMinor }],
      tx,
    );
    await this.outbox.add(
      tx,
      payoutPaid({
        payoutId: payout.id,
        sellerId,
        sellerUserId: seller.userId,
        amountMinor: amountMinor.toString(),
      }),
    );
    this.payouts.inc();
    this.logger.log(
      {
        payoutId: payout.id,
        sellerId,
        amountMinor: amountMinor.toString(),
        entries: entries.length,
      },
      'Seller paid out',
    );
    return true;
  }
}
