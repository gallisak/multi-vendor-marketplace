import { Processor } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Emitter } from '@socket.io/redis-emitter';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import type { Counter, Histogram } from 'prom-client';
import type { PublishedEvent } from '../../common/events/domain-events.js';
import { queueName } from '../../common/events/subscriptions.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { DomainEventProcessor } from '../../infra/queue/domain-event.processor.js';
import { RealtimeSnapshotsService } from './realtime-snapshots.service.js';
import { targetsFor } from './realtime-routing.js';
import { room, SERVER_EVENTS } from './realtime.types.js';

export const REALTIME_EMITTER = Symbol('REALTIME_EMITTER');

@Processor(queueName('realtime'), { concurrency: 10 })
export class RealtimeProcessor extends DomainEventProcessor {
  protected readonly consumer = 'realtime' as const;

  constructor(
    cls: ClsService,
    @InjectMetric(METRIC.queueJobDuration) jobDuration: Histogram<string>,
    @InjectMetric(METRIC.realtimeMessages) private readonly messages: Counter<string>,
    @Inject(REALTIME_EMITTER) private readonly emitter: Emitter,
    private readonly snapshots: RealtimeSnapshotsService,
  ) {
    super(cls, jobDuration);
  }

  async handle(event: PublishedEvent) {
    for (const target of targetsFor(event)) {
      switch (target.kind) {
        case 'product': {
          const update = await this.snapshots.product(target.productId);
          if (update) this.emit(room.product(target.productId), SERVER_EVENTS.product, update);
          break;
        }
        case 'auction': {
          const update = await this.snapshots.auction(target.productId);
          if (update) this.emit(room.auction(target.productId), SERVER_EVENTS.auction, update);
          break;
        }
        case 'order': {
          const order = await this.snapshots.order(target.orderId);
          if (order) this.emit(room.user(order.buyerId), SERVER_EVENTS.order, order.update);
          for (const sellerOrder of await this.snapshots.sellerOrders(target.orderId)) {
            this.emit(
              room.user(sellerOrder.sellerUserId),
              SERVER_EVENTS.sellerOrder,
              sellerOrder.update,
            );
          }
          break;
        }
      }
    }
  }

  private emit(roomName: string, eventName: string, payload: object) {
    this.emitter.to(roomName).emit(eventName, payload);
    this.messages.inc({ event: eventName });
  }
}
