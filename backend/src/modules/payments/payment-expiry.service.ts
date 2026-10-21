import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import { PaymentsService } from './payments.service.js';

@Injectable()
export class PaymentExpiryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentExpiryService.name);
  private readonly stop = new AbortController();
  private readonly timeoutMs: number;
  private readonly intervalMs: number;
  private loop?: Promise<void>;

  constructor(
    private readonly payments: PaymentsService,
    config: ConfigService<Env, true>,
  ) {
    this.timeoutMs = durationToSeconds(config.get('PAYMENT_TIMEOUT', { infer: true })) * 1000;
    this.intervalMs = config.get('PAYMENT_EXPIRY_INTERVAL_MS', { infer: true });
  }

  onApplicationBootstrap() {
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.stop.abort();
    await this.loop;
  }

  private async run() {
    while (!this.stop.signal.aborted) {
      try {
        await this.payments.expireStale(new Date(Date.now() - this.timeoutMs));
      } catch (error) {
        this.logger.warn({ err: error }, 'Payment expiry run failed');
      }
      await sleep(this.intervalMs, undefined, { signal: this.stop.signal }).catch(() => undefined);
    }
  }
}
