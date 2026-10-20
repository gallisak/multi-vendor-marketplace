import type { PublishedEvent } from '../../common/events/domain-events.js';
import { targetsFor } from './realtime-routing.js';

const event = (type: string, aggregateId: string, payload: object): PublishedEvent =>
  ({
    id: 'e1',
    type,
    aggregateType: 'x',
    aggregateId,
    payload,
    correlationId: null,
    occurredAt: '2026-10-20T10:00:00Z',
  }) as unknown as PublishedEvent;

describe('targetsFor', () => {
  it('pushes stock and price changes to the product room', () => {
    expect(targetsFor(event('product.changed', 'p1', { productId: 'p1' }))).toEqual([
      { kind: 'product', productId: 'p1' },
    ]);
  });

  it.each(['auction.bid_placed', 'auction.closed', 'auction.relisted'])(
    'updates the auction room on %s, the product room follows product.changed',
    (type) => {
      expect(targetsFor(event(type, 'a1', { productId: 'p1' }))).toEqual([
        { kind: 'auction', productId: 'p1' },
      ]);
    },
  );

  it.each([
    'order.placed',
    'order.payment_captured',
    'order.payment_failed',
    'seller-order.paid',
    'seller-order.status_changed',
    'payment.refund_requested',
  ])('updates buyer and sellers on %s', (type) => {
    expect(targetsFor(event(type, 'x', { orderId: 'o1' }))).toEqual([
      { kind: 'order', orderId: 'o1' },
    ]);
  });

  it('ignores unrelated events', () => {
    expect(targetsFor(event('seller.approved', 's1', {}))).toEqual([]);
  });
});
