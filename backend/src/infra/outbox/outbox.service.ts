import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { NewDomainEvent } from '../../common/events/domain-events.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class OutboxService {
  constructor(private readonly cls: ClsService) {}

  async add(tx: Prisma.TransactionClient, ...events: NewDomainEvent[]) {
    const correlationId = this.cls.isActive() ? (this.cls.getId() ?? null) : null;
    await tx.outboxEvent.createMany({
      data: events.map((event) => ({
        type: event.type,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        correlationId,
      })),
    });
  }
}
