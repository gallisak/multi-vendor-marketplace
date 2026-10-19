import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

const CHECK_TIMEOUT_MS = 1000;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function withTimeout<T>(promise: Promise<T>, ms = CHECK_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class DependenciesHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redisClient: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async database() {
    const check = this.indicator.check('database');
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return check.up();
    } catch (error) {
      return check.down({ message: errorMessage(error) });
    }
  }

  async redis() {
    const check = this.indicator.check('redis');
    if (this.redisClient.status !== 'ready') {
      return check.down({ message: `Connection status: ${this.redisClient.status}` });
    }
    try {
      await withTimeout(this.redisClient.ping());
      return check.up();
    } catch (error) {
      return check.down({ message: errorMessage(error) });
    }
  }

  async search() {
    const check = this.indicator.check('search');
    try {
      const res = await fetch(`${this.config.get('MEILI_HOST', { infer: true })}/health`, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      return res.ok ? check.up() : check.up({ degraded: true, httpStatus: res.status });
    } catch (error) {
      return check.up({ degraded: true, message: errorMessage(error) });
    }
  }
}
