import type { PublishedEvent } from '../../common/events/domain-events.js';

export type RealtimeTarget =
  | { kind: 'product'; productId: string }
  | { kind: 'auction'; productId: string }
  | { kind: 'order'; orderId: string };

export function targetsFor(event: PublishedEvent): RealtimeTarget[] {
  switch (event.type) {
    case 'product.changed':
      return [{ kind: 'product', productId: event.aggregateId }];
    case 'auction.bid_placed':
    case 'auction.closed':
    case 'auction.relisted': {
      const { productId } = event.payload as { productId: string };
      return [{ kind: 'auction', productId }];
    }
    case 'order.placed':
    case 'order.payment_captured':
    case 'order.payment_failed':
    case 'seller-order.paid':
    case 'seller-order.status_changed':
    case 'payment.refund_requested': {
      const { orderId } = event.payload as { orderId: string };
      return [{ kind: 'order', orderId }];
    }
    default:
      return [];
  }
}
