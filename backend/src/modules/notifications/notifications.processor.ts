import { Processor } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { NotificationsRepository } from './notifications.repository.js';

@Processor(queueName('notifications'), { concurrency: 5 })
export class NotificationsProcessor extends DomainEventProcessor {
  protected readonly consumer = 'notifications' as const;

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    private readonly idempotent: IdempotentConsumerService,
    private readonly notifications: NotificationsRepository,
  ) {
    super(cls, jobDuration);
  }

  async handle(event: PublishedEvent) {
    if (event.type !== 'seller.approved') {
      return;
    }
    const { userId, sellerId, storeName } = (event as PublishedEvent<'seller.approved'>).payload;

    const applied = await this.idempotent.runOnce(this.consumer, event.id, (tx) =>
      this.notifications.createMany(
        [{ userId, type: event.type, payload: { sellerId, storeName } }],
        tx,
      ),
    );
    if (!applied) {
      this.logger.log({ eventId: event.id }, 'Duplicate event skipped');
    }
  }
}
