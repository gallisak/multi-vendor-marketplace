import { CONSUMERS, queueName, subscribersOf } from './subscriptions.js';

describe('event subscriptions', () => {
  it('routes product changes to search, live updates and the catalog cache', () => {
    expect(subscribersOf('product.changed')).toEqual(['search-sync', 'realtime', 'catalog-cache']);
    expect(subscribersOf('category.changed')).toEqual(['search-sync', 'catalog-cache']);
  });

  it('tells sellers about payouts', () => {
    expect(subscribersOf('payout.paid')).toEqual(['notifications']);
  });

  it('routes seller approval to notifications', () => {
    expect(subscribersOf('seller.approved')).toEqual(['notifications']);
  });

  it('tells the user when Google sign-in is linked to their account', () => {
    expect(subscribersOf('user.google_linked')).toEqual(['notifications']);
  });

  it('starts the payment saga when an order is placed', () => {
    expect(subscribersOf('order.placed')).toEqual(['payments', 'realtime']);
  });

  it('sends refunds to the payment provider and tells the buyer', () => {
    expect(subscribersOf('payment.refund_requested')).toEqual([
      'notifications',
      'payments',
      'realtime',
      'analytics',
    ]);
  });

  it('notifies about payment failures and seller order changes', () => {
    expect(subscribersOf('order.payment_failed')).toEqual(['notifications', 'realtime']);
    expect(subscribersOf('seller-order.paid')).toEqual(['notifications', 'realtime']);
    expect(subscribersOf('seller-order.status_changed')).toEqual(['notifications', 'realtime']);
  });

  it('returns no subscribers for unknown events', () => {
    expect(subscribersOf('order.unknown')).toEqual([]);
  });

  it('pushes live auction and order changes to WebSocket clients', () => {
    expect(subscribersOf('auction.bid_placed')).toEqual(['notifications', 'realtime']);
    expect(subscribersOf('order.payment_captured')).toEqual(['realtime', 'analytics']);
  });

  it('feeds the sales read model from payments and refunds', () => {
    expect(subscribersOf('order.payment_captured')).toContain('analytics');
    expect(subscribersOf('payment.refund_requested')).toContain('analytics');
    expect(subscribersOf('order.placed')).not.toContain('analytics');
  });

  it('builds BullMQ-safe queue names', () => {
    for (const consumer of CONSUMERS) {
      expect(queueName(consumer)).toMatch(/^events\.[a-z-]+$/);
    }
  });
});
