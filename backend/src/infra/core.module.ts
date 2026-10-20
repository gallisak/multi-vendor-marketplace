import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envFilePaths, validateEnv } from './config/env.schema.js';
import { IdempotencyModule } from './idempotency/idempotency.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths(),
      validate: validateEnv,
    }),
    LoggingModule,
    PrismaModule,
    RedisModule,
    MetricsModule,
    QueueModule,
    OutboxModule,
    IdempotencyModule,
  ],
})
export class CoreModule {}
