import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import { REDIS } from '../../infra/redis/redis.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeSnapshotsRepository } from './realtime-snapshots.repository.js';
import { RealtimeSnapshotsService } from './realtime-snapshots.service.js';
import { tolerantPublisher } from './realtime-publisher.js';
import { REALTIME_EMITTER, RealtimeProcessor } from './realtime.processor.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { REALTIME_NAMESPACE } from './realtime.types.js';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeSnapshotsService, RealtimeSnapshotsRepository],
})
export class RealtimeModule {}

@Module({
  providers: [
    RealtimeSnapshotsService,
    RealtimeSnapshotsRepository,
    RealtimeProcessor,
    {
      provide: REALTIME_EMITTER,
      inject: [REDIS],
      useFactory: (redis: Redis) => new Emitter(tolerantPublisher(redis)).of(REALTIME_NAMESPACE),
    },
  ],
})
export class RealtimeWorkerModule {}
