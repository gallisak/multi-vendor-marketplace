import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsController } from './metrics.controller.js';
import { METRIC } from './metric-names.js';

const providers = [
  makeHistogramProvider({
    name: METRIC.httpDuration,
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  }),
  makeCounterProvider({
    name: METRIC.httpErrors,
    help: 'HTTP responses with status >= 500',
    labelNames: ['method', 'route', 'status'],
  }),
  makeHistogramProvider({
    name: METRIC.queueJobDuration,
    help: 'Queue job processing time in seconds',
    labelNames: ['queue', 'event', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),
  makeCounterProvider({
    name: METRIC.outboxPublished,
    help: 'Outbox events handed over to queues',
    labelNames: ['type'],
  }),
  makeCounterProvider({
    name: METRIC.outboxPublishFailures,
    help: 'Failed outbox relay batches',
  }),
  makeGaugeProvider({
    name: METRIC.outboxPending,
    help: 'Outbox events waiting to be published',
  }),
  makeCounterProvider({
    name: METRIC.ordersPlaced,
    help: 'Orders created by checkout',
  }),
  makeCounterProvider({
    name: METRIC.checkoutRejections,
    help: 'Checkouts rejected by business rules',
    labelNames: ['reason'],
  }),
  makeCounterProvider({
    name: METRIC.payments,
    help: 'Payment attempts by outcome',
    labelNames: ['status'],
  }),
  makeCounterProvider({
    name: METRIC.payouts,
    help: 'Mock transfers paid out to sellers',
  }),
  makeCounterProvider({
    name: METRIC.bids,
    help: 'Bids by outcome',
    labelNames: ['result'],
  }),
  makeCounterProvider({
    name: METRIC.auctionsClosed,
    help: 'Auctions closed or relisted by the sweeper',
    labelNames: ['outcome'],
  }),
  makeGaugeProvider({
    name: METRIC.wsConnections,
    help: 'Open WebSocket connections on this instance',
  }),
  makeCounterProvider({
    name: METRIC.oauthSignIns,
    help: 'Google sign-in attempts by outcome',
    labelNames: ['outcome'],
  }),
  makeCounterProvider({
    name: METRIC.cacheRequests,
    help: 'Catalog cache lookups by result',
    labelNames: ['cache', 'result'],
  }),
  makeCounterProvider({
    name: METRIC.realtimeMessages,
    help: 'Realtime messages pushed to WebSocket rooms',
    labelNames: ['event'],
  }),
  makeCounterProvider({
    name: METRIC.searchFallbacks,
    help: 'Search requests served from the database fallback',
    labelNames: ['reason'],
  }),
];

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      controller: MetricsController,
      defaultMetrics: { enabled: true },
    }),
  ],
  providers,
  exports: providers,
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*path');
  }
}
