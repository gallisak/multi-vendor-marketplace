import { CONSUMERS, queueName, subscribersOf } from './subscriptions.js';

describe('event subscriptions', () => {
  it('routes product changes to search sync only', () => {
    expect(subscribersOf('product.changed')).toEqual(['search-sync']);
  });

  it('routes seller approval to notifications', () => {
    expect(subscribersOf('seller.approved')).toEqual(['notifications']);
  });

  it('returns no subscribers for unknown events', () => {
    expect(subscribersOf('order.unknown')).toEqual([]);
  });

  it('builds BullMQ-safe queue names', () => {
    for (const consumer of CONSUMERS) {
      expect(queueName(consumer)).toMatch(/^events\.[a-z-]+$/);
    }
  });
});
