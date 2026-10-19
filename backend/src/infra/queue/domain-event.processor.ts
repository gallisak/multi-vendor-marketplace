import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CLS_ID, ClsService } from 'nestjs-cls';
import type { Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import type { Consumer } from '../../common/events/subscriptions.js';

export abstract class DomainEventProcessor extends WorkerHost {
  protected abstract readonly consumer: Consumer;
  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(
    private readonly cls: ClsService,
    private readonly jobDuration: Histogram<string>,
  ) {
    super();
  }

  process(job: Job<PublishedEvent>): Promise<void> {
    return this.cls.run(async () => {
      this.cls.set(CLS_ID, job.data.correlationId ?? job.data.id);
      const stopTimer = this.jobDuration.startTimer({ queue: this.consumer, event: job.name });
      try {
        await this.handle(job.data, job);
        stopTimer({ status: 'completed' });
        this.logger.log({ eventId: job.data.id, type: job.name }, 'Event processed');
      } catch (error) {
        stopTimer({ status: 'failed' });
        this.logger.warn(
          { err: error, eventId: job.data.id, type: job.name, attempt: job.attemptsMade + 1 },
          'Event processing failed',
        );
        throw error;
      }
    });
  }

  abstract handle(event: PublishedEvent, job?: Job<PublishedEvent>): Promise<void>;
}
