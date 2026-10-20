import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RETENTION = {
  publishedOutboxEventsMs: 7 * DAY_MS,
  processedEventsMs: 30 * DAY_MS,
  deadRefreshTokensMs: 7 * DAY_MS,
} as const;

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.runSafely(), HOUR_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async cleanup(now = new Date()) {
    const before = (ms: number) => new Date(now.getTime() - ms);
    const [outbox, processed, refreshTokens, idempotencyKeys] = await Promise.all([
      this.prisma.outboxEvent.deleteMany({
        where: { publishedAt: { lt: before(RETENTION.publishedOutboxEventsMs) } },
      }),
      this.prisma.processedEvent.deleteMany({
        where: { processedAt: { lt: before(RETENTION.processedEventsMs) } },
      }),
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: before(RETENTION.deadRefreshTokensMs) } },
          ],
        },
      }),
      this.prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    return {
      outboxEvents: outbox.count,
      processedEvents: processed.count,
      refreshTokens: refreshTokens.count,
      idempotencyKeys: idempotencyKeys.count,
    };
  }

  private async runSafely() {
    try {
      const removed = await this.cleanup();
      this.logger.log(removed, 'Maintenance cleanup finished');
    } catch (error) {
      this.logger.warn({ err: error }, 'Maintenance cleanup failed');
    }
  }
}
