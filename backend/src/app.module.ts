import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { envFilePaths, validateEnv } from './infra/config/env.schema.js';
import { HealthModule } from './infra/health/health.module.js';
import { LoggingModule } from './infra/logging/logging.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { ThrottlingModule } from './infra/throttling/throttling.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';

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
    HealthModule,
    ThrottlingModule,
    UsersModule,
    AuthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
