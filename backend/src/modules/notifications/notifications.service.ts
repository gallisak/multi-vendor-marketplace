import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository.js';

const RECENT_LIMIT = 50;

@Injectable()
export class NotificationsService {
  constructor(private readonly notifications: NotificationsRepository) {}

  recent(userId: string) {
    return this.notifications.findRecent(userId, RECENT_LIMIT);
  }

  async markAllRead(userId: string) {
    return { updated: await this.notifications.markAllRead(userId, new Date()) };
  }
}
