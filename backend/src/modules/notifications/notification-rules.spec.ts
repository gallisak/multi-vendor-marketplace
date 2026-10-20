import type { DomainEventPayloads, PublishedEvent } from '../../common/events/domain-events.js';
import { notificationFor, PAYMENT_FAILED_REASON } from './notification-rules.js';

const event = <T extends keyof DomainEventPayloads>(
  type: T,
  payload: DomainEventPayloads[T],
): PublishedEvent => ({
  id: 'e1',
  type,
  aggregateType: 'x',
  aggregateId: 'a1',
  payload,
  correlationId: null,
  occurredAt: '2026-10-20T10:00:00Z',
});

const statusChanged = (reason: string | null) =>
  event('seller-order.status_changed', {
    sellerOrderId: 'so1',
    orderId: 'o1',
    sellerId: 's1',
    buyerId: 'buyer',
    from: 'PROCESSING',
    to: 'SHIPPED',
    orderStatus: 'PARTIALLY_SHIPPED',
    reason,
  });

describe('notificationFor', () => {
  it('tells the seller about a payout', () => {
    expect(
      notificationFor(
        event('payout.paid', {
          payoutId: 'p1',
          sellerId: 's1',
          sellerUserId: 'seller-user',
          amountMinor: '7200',
        }),
      ),
    ).toEqual({
      userId: 'seller-user',
      type: 'payout.paid',
      payload: { payoutId: 'p1', amountMinor: '7200' },
    });
  });

  it('tells the seller about a new paid order', () => {
    expect(
      notificationFor(
        event('seller-order.paid', {
          sellerOrderId: 'so1',
          orderId: 'o1',
          sellerId: 's1',
          sellerUserId: 'seller-user',
          subtotalMinor: '1000',
        }),
      ),
    ).toEqual({
      userId: 'seller-user',
      type: 'seller-order.paid',
      payload: { sellerOrderId: 'so1', orderId: 'o1', subtotalMinor: '1000' },
    });
  });

  it('tells the buyer about seller order progress', () => {
    expect(notificationFor(statusChanged(null))).toMatchObject({
      userId: 'buyer',
      payload: { status: 'SHIPPED', orderStatus: 'PARTIALLY_SHIPPED' },
    });
  });

  it('sends one payment failure notice instead of one per cancelled seller order', () => {
    expect(notificationFor(statusChanged(PAYMENT_FAILED_REASON))).toBeNull();
    expect(
      notificationFor(
        event('order.payment_failed', { orderId: 'o1', buyerId: 'buyer', reason: 'declined' }),
      ),
    ).toMatchObject({ userId: 'buyer', type: 'order.payment_failed' });
  });

  it('ignores events nobody needs to hear about', () => {
    expect(
      notificationFor(event('product.changed', { productId: 'p1', reason: 'updated' })),
    ).toBeNull();
  });
});
