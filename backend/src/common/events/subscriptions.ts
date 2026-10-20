import type { DomainEventType } from './domain-events.js';

export const CONSUMERS = [
  'search-sync',
  'notifications',
  'payments',
  'realtime',
  'analytics',
] as const;
export type Consumer = (typeof CONSUMERS)[number];

export const SUBSCRIPTIONS: Record<Consumer, readonly DomainEventType[]> = {
  'search-sync': ['product.changed', 'category.changed'],
  notifications: [
    'seller.approved',
    'seller-order.paid',
    'seller-order.status_changed',
    'order.payment_failed',
    'payment.refund_requested',
    'payout.paid',
    'auction.bid_placed',
    'auction.closed',
    'auction.relisted',
    'dispute.opened',
    'dispute.resolved',
  ],
  payments: ['order.placed', 'payment.refund_requested'],
  realtime: [
    'product.changed',
    'auction.bid_placed',
    'auction.closed',
    'auction.relisted',
    'order.placed',
    'order.payment_captured',
    'order.payment_failed',
    'seller-order.paid',
    'seller-order.status_changed',
    'payment.refund_requested',
  ],
  analytics: ['order.payment_captured', 'payment.refund_requested'],
};

export const queueName = (consumer: Consumer) => `events.${consumer}`;

export const subscribersOf = (type: string): Consumer[] =>
  CONSUMERS.filter((consumer) => (SUBSCRIPTIONS[consumer] as readonly string[]).includes(type));
