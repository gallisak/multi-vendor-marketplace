import { CONSUMERS, queueName, subscribersOf } from './subscriptions.js';

describe('event subscriptions', () => {
  it('routes product changes to search sync only', () => {
    expect(subscribersOf('product.changed')).toEqual(['search-sync']);
  });

  it('tells sellers about payouts', () => {
    expect(subscribersOf('payout.paid')).toEqual(['notifications']);
  });

  it('routes seller approval to notifications', () => {
    expect(subscribersOf('seller.approved')).toEqual(['notifications']);
  });

  it('starts the payment saga when an order is placed', () => {
    expect(subscribersOf('order.placed')).toEqual(['payments']);
  });

  it('notifies about payment failures and seller order changes', () => {
    expect(subscribersOf('order.payment_failed')).toEqual(['notifications']);
    expect(subscribersOf('seller-order.paid')).toEqual(['notifications']);
    expect(subscribersOf('seller-order.status_changed')).toEqual(['notifications']);
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
