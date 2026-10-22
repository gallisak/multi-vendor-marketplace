import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { type DomainEventPayloads, payoutPaid } from '../../common/events/domain-events.js';
import { PayoutStatus } from '../../generated/prisma/enums.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { LedgerRepository } from './ledger.repository.js';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway.js';

@Injectable()
export class PayoutTransferService {
  private readonly logger = new Logger(PayoutTransferService.name);

  constructor(
    private readonly ledger: LedgerRepository,
    private readonly outbox: OutboxService,
    private readonly idempotent: IdempotentConsumerService,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
    @InjectMetric(METRIC.payouts) private readonly payouts: Counter<string>,
  ) {}

  async transfer(eventId: string, request: DomainEventPayloads['payout.requested']) {
    const payout = await this.ledger.findPayout(request.payoutId);
    if (!payout || payout.status !== PayoutStatus.PENDING) {
      return;
    }

    const { providerRef } = await this.gateway.transfer({
      idempotencyKey: payout.id,
      sellerId: payout.sellerId,
      amountMinor: payout.amountMinor,
    });

    await this.idempotent.runOnce('payouts', eventId, async (tx) => {
      if (!(await this.ledger.markPayoutPaid(payout.id, providerRef, tx))) {
        return;
      }
      await this.outbox.add(tx, payoutPaid(request));
      this.payouts.inc();
      this.logger.log(
        { payoutId: payout.id, sellerId: payout.sellerId, amountMinor: request.amountMinor },
        'Seller paid out',
      );
    });
  }
}
