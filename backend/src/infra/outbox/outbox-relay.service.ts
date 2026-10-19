import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge } from 'prom-client';
import { setTimeout as sleep } from 'node:timers/promises';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { type Consumer, subscribersOf } from '../../common/events/subscriptions.js';
import type { DomainEventType } from '../../common/events/domain-events.js';
import type { Env } from '../config/env.schema.js';
import { METRIC } from '../metrics/metric-names.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { retryDelayMs, shouldLogFailure } from './relay-backoff.js';
import { EVENT_QUEUES, type EventQueues } from '../queue/queue.module.js';

interface OutboxRow {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  correlationId: string | null;
  createdAt: Date;
}

@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly stop = new AbortController();
  private loop?: Promise<void>;
  private consecutiveFailures = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_QUEUES) private readonly queues: EventQueues,
    private readonly config: ConfigService<Env, true>,
    @InjectMetric(METRIC.outboxPublished) private readonly published: Counter<string>,
    @InjectMetric(METRIC.outboxPublishFailures) private readonly failures: Counter<string>,
    @InjectMetric(METRIC.outboxPending) private readonly pending: Gauge<string>,
  ) {}

  onApplicationBootstrap() {
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.stop.abort();
    await this.loop;
  }

  async publishBatch(): Promise<number> {
    const batchSize = this.config.get('OUTBOX_BATCH_SIZE', { infer: true });
    let claimedIds: string[] = [];

    try {
      const published = await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<OutboxRow[]>`
            SELECT id, type, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId",
                   payload, correlation_id AS "correlationId", created_at AS "createdAt"
            FROM outbox_events
            WHERE published_at IS NULL
            ORDER BY created_at, id
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED`;
          if (rows.length === 0) {
            return [];
          }
          claimedIds = rows.map((row) => row.id);

          await this.enqueue(rows);
          await tx.outboxEvent.updateMany({
            where: { id: { in: claimedIds } },
            data: { publishedAt: new Date() },
          });

          return rows.map((row) => row.type);
        },
        { timeout: 15_000 },
      );
      published.forEach((type) => this.published.inc({ type }));
      return published.length;
    } catch (error) {
      this.failures.inc();
      if (claimedIds.length) {
        await this.prisma.outboxEvent
          .updateMany({
            where: { id: { in: claimedIds } },
            data: { attempts: { increment: 1 }, lastError: String(error).slice(0, 500) },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private async enqueue(rows: OutboxRow[]) {
    const jobsByConsumer = new Map<
      Consumer,
      { name: string; data: PublishedEvent; opts: object }[]
    >();
    for (const row of rows) {
      const event: PublishedEvent = {
        id: row.id,
        type: row.type as DomainEventType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        payload: row.payload as PublishedEvent['payload'],
        correlationId: row.correlationId,
        occurredAt: row.createdAt.toISOString(),
      };
      for (const consumer of subscribersOf(row.type)) {
        const jobs = jobsByConsumer.get(consumer) ?? [];
        jobs.push({ name: row.type, data: event, opts: { jobId: row.id } });
        jobsByConsumer.set(consumer, jobs);
      }
    }

    await Promise.all(
      [...jobsByConsumer].map(([consumer, jobs]) => this.queues.get(consumer)!.addBulk(jobs)),
    );
  }

  private async tick(batchSize: number): Promise<'more' | 'idle' | 'failed'> {
    try {
      const published = await this.publishBatch();
      if (this.consecutiveFailures > 0) {
        this.logger.log({ after: this.consecutiveFailures }, 'Outbox relay recovered');
        this.consecutiveFailures = 0;
      }
      if (published === batchSize) {
        return 'more';
      }
      this.pending.set(await this.prisma.outboxEvent.count({ where: { publishedAt: null } }));
      return 'idle';
    } catch (error) {
      this.consecutiveFailures += 1;
      if (shouldLogFailure(this.consecutiveFailures)) {
        this.logger.error(
          { err: error, consecutiveFailures: this.consecutiveFailures },
          'Outbox relay batch failed',
        );
      }
      return 'failed';
    }
  }

  private async run() {
    const interval = this.config.get('OUTBOX_RELAY_INTERVAL_MS', { infer: true });
    const batchSize = this.config.get('OUTBOX_BATCH_SIZE', { infer: true });
    this.logger.log({ interval, batchSize }, 'Outbox relay started');

    while (!this.stop.signal.aborted) {
      const state = await this.tick(batchSize);
      if (state !== 'more') {
        const delay =
          state === 'failed' ? retryDelayMs(interval, this.consecutiveFailures) : interval;
        await sleep(delay, undefined, { signal: this.stop.signal }).catch(() => undefined);
      }
    }
    this.logger.log('Outbox relay stopped');
  }
}
