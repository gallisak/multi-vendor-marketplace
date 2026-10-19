import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { Consumer, CONSUMERS, queueName } from '../../common/events/subscriptions.js';
import type { Env } from '../config/env.schema.js';
import { redisConnectionFromUrl } from '../redis/redis-url.js';

export const EVENT_QUEUES = Symbol('EVENT_QUEUES');
export type EventQueues = ReadonlyMap<Consumer, Queue>;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 10,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

const queueRegistrations = BullModule.registerQueue(
  ...CONSUMERS.map((consumer) => ({
    name: queueName(consumer),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })),
);

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        prefix: 'mvm',
        connection: redisConnectionFromUrl(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    queueRegistrations,
  ],
  providers: [
    {
      provide: EVENT_QUEUES,
      inject: CONSUMERS.map((consumer) => getQueueToken(queueName(consumer))),
      useFactory: (...queues: Queue[]): EventQueues =>
        new Map(CONSUMERS.map((consumer, index) => [consumer, queues[index]])),
    },
  ],
  exports: [queueRegistrations, EVENT_QUEUES],
})
export class QueueModule {}
