import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Env } from '../config/env.schema.js';
import {
  isBidRequest,
  isLoginRequest,
  loginEmailTracker,
  type TrackedRequest,
} from './login-throttle.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const MINUTE = 60_000;
const notLogin = (context: Parameters<typeof isLoginRequest>[0]) => !isLoginRequest(context);
const notBid = (context: Parameters<typeof isBidRequest>[0]) => !isBidRequest(context);

@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
class ThrottlerStorageModule {}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (
        config: ConfigService<Env, true>,
        storage: RedisThrottlerStorage,
      ): ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'default',
            ttl: MINUTE,
            limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
          },
          {
            name: 'login-email',
            ttl: MINUTE,
            limit: 5,
            blockDuration: MINUTE,
            skipIf: notLogin,
            getTracker: (req) => loginEmailTracker(req as TrackedRequest),
          },
          {
            name: 'login-ip',
            ttl: MINUTE,
            limit: config.get('LOGIN_IP_RATE_LIMIT_PER_MINUTE', { infer: true }),
            blockDuration: MINUTE,
            skipIf: notLogin,
          },
          {
            name: 'bid-ip',
            ttl: MINUTE,
            limit: config.get('BID_RATE_LIMIT_PER_MINUTE', { infer: true }),
            skipIf: notBid,
          },
        ],
        storage,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
