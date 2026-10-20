export const METRIC = {
  httpDuration: 'http_request_duration_seconds',
  httpErrors: 'http_server_errors_total',
  queueJobDuration: 'queue_job_duration_seconds',
  outboxPublished: 'outbox_events_published_total',
  outboxPublishFailures: 'outbox_publish_failures_total',
  outboxPending: 'outbox_pending_events',
  searchFallbacks: 'search_fallbacks_total',
  ordersPlaced: 'orders_placed_total',
  checkoutRejections: 'checkout_rejections_total',
  payments: 'payments_total',
  payouts: 'payouts_total',
} as const;
