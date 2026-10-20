import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import { PayoutsService } from './payouts.service.js';

@Injectable()
export class PayoutSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PayoutSchedulerService.name);
  private readonly stop = new AbortController();
  private readonly holdMs: number;
  private readonly intervalMs: number;
  private loop?: Promise<void>;

  constructor(
    private readonly payouts: PayoutsService,
    config: ConfigService<Env, true>,
  ) {
    this.holdMs = durationToSeconds(config.get('PAYOUT_HOLD', { infer: true })) * 1000;
    this.intervalMs = config.get('PAYOUT_INTERVAL_MS', { infer: true });
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
        await this.payouts.payDue(new Date(Date.now() - this.holdMs));
      } catch (error) {
        this.logger.warn({ err: error }, 'Payout run failed');
      }
      await sleep(this.intervalMs, undefined, { signal: this.stop.signal }).catch(() => undefined);
    }
  }
}
