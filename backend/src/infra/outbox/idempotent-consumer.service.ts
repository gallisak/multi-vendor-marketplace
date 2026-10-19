import { Injectable } from '@nestjs/common';
import type { Consumer } from '../../common/events/subscriptions.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class IdempotentConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  runOnce(
    consumer: Consumer,
    eventId: string,
    effect: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO processed_events (consumer, event_id)
        VALUES (${consumer}, ${eventId}::uuid)
        ON CONFLICT DO NOTHING`;
      if (inserted === 0) {
        return false;
      }
      await effect(tx);
      return true;
    });
  }
}
