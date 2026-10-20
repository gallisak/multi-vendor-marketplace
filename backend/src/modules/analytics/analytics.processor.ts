import { Processor } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { SalesProjectionService } from './sales-projection.service.js';

@Processor(queueName('analytics'), { concurrency: 5 })
export class AnalyticsProcessor extends DomainEventProcessor {
  protected readonly consumer = 'analytics' as const;

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    private readonly projection: SalesProjectionService,
  ) {
    super(cls, jobDuration);
  }

  async handle(event: PublishedEvent) {
    if (event.type === 'order.payment_captured') {
      await this.projection.recordPayment(event.id, event.aggregateId);
    } else if (event.type === 'payment.refund_requested') {
      await this.projection.recordRefund(
        event.id,
        (event as PublishedEvent<'payment.refund_requested'>).payload,
      );
    }
  }
}
