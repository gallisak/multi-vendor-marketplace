import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { NextFunction, Request, Response } from 'express';
import type { Counter, Histogram } from 'prom-client';
import { METRIC } from './metric-names.js';

const SKIPPED_PATHS = new Set(['/metrics', '/health', '/health/ready']);

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    @InjectMetric(METRIC.httpDuration) private readonly duration: Histogram<string>,
    @InjectMetric(METRIC.httpErrors) private readonly errors: Counter<string>,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (SKIPPED_PATHS.has(req.originalUrl.split('?')[0])) {
      return next();
    }

    const stopTimer = this.duration.startTimer();
    res.once('finish', () => {
      const routePath = (req.route as { path?: unknown } | undefined)?.path;
      const labels = {
        method: req.method,
        route:
          typeof routePath === 'string' && !routePath.includes('*')
            ? `${req.baseUrl}${routePath}`
            : 'unmatched',
        status: String(res.statusCode),
      };
      stopTimer(labels);
      if (res.statusCode >= 500) {
        this.errors.inc(labels);
      }
    });
    next();
  }
}
