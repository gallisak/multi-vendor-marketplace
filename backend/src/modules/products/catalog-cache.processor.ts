import { Processor } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { changeAffectsListing } from './catalog-cache.rules.js';
import { CatalogCacheService } from './catalog-cache.service.js';

@Processor(queueName('catalog-cache'), { concurrency: 10 })
export class CatalogCacheProcessor extends DomainEventProcessor {
  protected readonly consumer = 'catalog-cache' as const;

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    private readonly cache: CatalogCacheService,
  ) {
    super(cls, jobDuration);
  }

  async handle(event: PublishedEvent) {
    switch (event.type) {
      case 'product.changed': {
        const { reason } = (event as PublishedEvent<'product.changed'>).payload;
        await this.cache.invalidateProduct(event.aggregateId, changeAffectsListing(reason));
        return;
      }
      case 'category.changed':
        await this.cache.invalidateAll();
        return;
    }
  }
}
