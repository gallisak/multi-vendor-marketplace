import { Processor } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { PaymentsService } from './payments.service.js';

@Processor(queueName('payments'), { concurrency: 5 })
export class PaymentsProcessor extends DomainEventProcessor {
  protected readonly consumer = 'payments' as const;

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    private readonly payments: PaymentsService,
  ) {
    super(cls, jobDuration);
  }

  async handle(event: PublishedEvent) {
    if (event.type === 'payment.refund_requested') {
      await this.payments.refund(
        event.id,
        (event as PublishedEvent<'payment.refund_requested'>).payload,
      );
      return;
    }
    if (event.type === 'order.placed') {
      await this.payments.settle(
        event.id,
        (event as PublishedEvent<'order.placed'>).payload.orderId,
      );
    }
  }
}
