import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export interface NewNotification {
  userId: string;
  type: string;
  payload: Record<string, string | null>;
}

@Injectable()
export class NotificationsRepository extends PrismaRepository {
  findRecent(userId: string, take: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    });
  }

  async createMany(notifications: NewNotification[], tx: Transaction) {
    await tx.notification.createMany({
      data: notifications.map((notification) => ({
        userId: notification.userId,
        type: notification.type,
        payload: notification.payload,
      })),
    });
  }
}
