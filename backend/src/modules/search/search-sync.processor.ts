import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Job, Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { SearchSyncService } from './search-sync.service.js';

export const REINDEX_JOB = 'search.reindex';
export const BOOTSTRAP_JOB = 'search.bootstrap';

@Processor(queueName('search-sync'), { concurrency: 1 })
export class SearchSyncProcessor extends DomainEventProcessor implements OnApplicationBootstrap {
  protected readonly consumer = 'search-sync' as const;
  private readonly bootLogger = new Logger(SearchSyncProcessor.name);

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    private readonly sync: SearchSyncService,
    @InjectQueue(queueName('search-sync')) private readonly queue: Queue,
  ) {
    super(cls, jobDuration);
  }

  async onApplicationBootstrap() {
    try {
      await this.queue.add(BOOTSTRAP_JOB, {}, { jobId: `${BOOTSTRAP_JOB}-${Date.now()}` });
    } catch (error) {
      this.bootLogger.warn({ err: error }, 'Could not schedule search index bootstrap');
    }
  }

  async handle(event: PublishedEvent, job?: Job<PublishedEvent>) {
    if (job?.name === REINDEX_JOB) {
      await this.sync.reindexAll();
      return;
    }
    if (job?.name === BOOTSTRAP_JOB) {
      await this.sync.bootstrap();
      return;
    }

    switch (event.type) {
      case 'product.changed':
        await this.sync.syncProducts([event.aggregateId]);
        return;
      case 'category.changed':
        await this.sync.syncCategory(event.aggregateId);
        return;
    }
  }
}
