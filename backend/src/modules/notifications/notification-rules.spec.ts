import type { DomainEventPayloads, PublishedEvent } from '../../common/events/domain-events.js';
import { notificationFor, notificationsFor, PAYMENT_FAILED_REASON } from './notification-rules.js';

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

  it('tells the buyer about a refund', () => {
    expect(
      notificationFor(
        event('payment.refund_requested', {
          orderId: 'o1',
          buyerId: 'buyer',
          sellerOrderId: 'so1',
          refundId: null,
          amountMinor: '500',
          reason: 'cancelled',
        }),
      ),
    ).toMatchObject({ userId: 'buyer', payload: { amountMinor: '500', reason: 'cancelled' } });
  });

  it('ignores events nobody needs to hear about', () => {
    expect(
      notificationFor(event('product.changed', { productId: 'p1', reason: 'updated' })),
    ).toBeNull();
  });
});

describe('auction notifications', () => {
  const bid = (previousLeaderId: string | null) =>
    event('auction.bid_placed', {
      auctionId: 'a1',
      productId: 'p1',
      bidderId: 'new-leader',
      previousLeaderId,
      amountMinor: 1500,
      bidCount: 2,
      minNextBidMinor: 1600,
      endsAt: '2026-10-21T10:00:00Z',
    });

  it('tells the previous leader they were outbid', () => {
    expect(notificationsFor(bid('old-leader'))).toEqual([
      {
        userId: 'old-leader',
        type: 'auction.outbid',
        payload: { productId: 'p1', amountMinor: '1500', minNextBidMinor: '1600' },
      },
    ]);
  });

  it('stays silent for the first bid', () => {
    expect(notificationsFor(bid(null))).toEqual([]);
  });

  it('tells both the seller and the winner when an auction is won', () => {
    const drafts = notificationsFor(
      event('auction.closed', {
        auctionId: 'a1',
        productId: 'p1',
        title: 'Lot',
        sellerUserId: 'seller',
        outcome: 'won',
        winnerId: 'winner',
        amountMinor: 1500,
        checkoutDeadline: '2026-10-21T10:00:00Z',
      }),
    );

    expect(drafts.map((d) => [d.userId, d.type])).toEqual([
      ['seller', 'auction.closed'],
      ['winner', 'auction.won'],
    ]);
  });

  it('tells only the seller about an unsold lot', () => {
    expect(
      notificationsFor(
        event('auction.closed', {
          auctionId: 'a1',
          productId: 'p1',
          title: 'Lot',
          sellerUserId: 'seller',
          outcome: 'unsold',
          winnerId: null,
          amountMinor: null,
          checkoutDeadline: null,
        }),
      ).map((d) => d.userId),
    ).toEqual(['seller']);
  });

  it('tells the seller and the winner who missed the window about relisting', () => {
    expect(
      notificationsFor(
        event('auction.relisted', {
          auctionId: 'a1',
          productId: 'p1',
          title: 'Lot',
          sellerUserId: 'seller',
          previousWinnerId: 'late-winner',
          endsAt: '2026-10-22T10:00:00Z',
          reason: 'checkout_expired',
        }),
      ).map((d) => [d.userId, d.type]),
    ).toEqual([
      ['seller', 'auction.relisted'],
      ['late-winner', 'auction.checkout_expired'],
    ]);
  });

  it('tells only the seller when a lot returns because the order was cancelled', () => {
    expect(
      notificationsFor(
        event('auction.relisted', {
          auctionId: 'a1',
          productId: 'p1',
          title: 'Lot',
          sellerUserId: 'seller',
          previousWinnerId: 'winner',
          endsAt: '2026-10-22T10:00:00Z',
          reason: 'order_cancelled',
        }),
      ).map((d) => [d.userId, d.payload.reason]),
    ).toEqual([['seller', 'order_cancelled']]);
  });
});
