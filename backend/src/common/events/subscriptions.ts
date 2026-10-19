import type { DomainEventType } from './domain-events.js';

export const CONSUMERS = ['search-sync', 'notifications'] as const;
export type Consumer = (typeof CONSUMERS)[number];

export const SUBSCRIPTIONS: Record<Consumer, readonly DomainEventType[]> = {
  'search-sync': ['product.changed', 'category.changed'],
  notifications: ['seller.approved'],
};

export const queueName = (consumer: Consumer) => `events.${consumer}`;

export const subscribersOf = (type: string): Consumer[] =>
  CONSUMERS.filter((consumer) => (SUBSCRIPTIONS[consumer] as readonly string[]).includes(type));
