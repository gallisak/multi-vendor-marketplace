import { Processor } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { PayoutTransferService } from './payout-transfer.service.js';

@Processor(queueName('payouts'), { concurrency: 5 })
export class PayoutsProcessor extends DomainEventProcessor {
  protected readonly consumer = 'payouts' as const;

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    private readonly transfers: PayoutTransferService,
  ) {
    super(cls, jobDuration);
  }

  async handle(event: PublishedEvent) {
    if (event.type === 'payout.requested') {
      await this.transfers.transfer(
        event.id,
        (event as PublishedEvent<'payout.requested'>).payload,
      );
    }
  }
}
