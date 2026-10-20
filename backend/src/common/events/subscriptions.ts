import type { DomainEventType } from './domain-events.js';

export const CONSUMERS = ['search-sync', 'notifications', 'payments'] as const;
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
  ],
  payments: ['order.placed', 'payment.refund_requested'],
};

export const queueName = (consumer: Consumer) => `events.${consumer}`;

export const subscribersOf = (type: string): Consumer[] =>
  CONSUMERS.filter((consumer) => (SUBSCRIPTIONS[consumer] as readonly string[]).includes(type));
