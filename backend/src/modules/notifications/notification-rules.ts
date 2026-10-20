import type { PublishedEvent } from '../../common/events/domain-events.js';

export const PAYMENT_FAILED_REASON = 'payment_failed';

export interface NotificationDraft {
  userId: string;
  type: string;
  payload: Record<string, string | null>;
}

export function notificationFor(event: PublishedEvent): NotificationDraft | null {
  switch (event.type) {
    case 'payout.paid': {
      const p = (event as PublishedEvent<'payout.paid'>).payload;
      return {
        userId: p.sellerUserId,
        type: event.type,
        payload: { payoutId: p.payoutId, amountMinor: p.amountMinor },
      };
    }
    case 'seller.approved': {
      const { userId, sellerId, storeName } = (event as PublishedEvent<'seller.approved'>).payload;
      return { userId, type: event.type, payload: { sellerId, storeName } };
    }
    case 'seller-order.paid': {
      const p = (event as PublishedEvent<'seller-order.paid'>).payload;
      return {
        userId: p.sellerUserId,
        type: event.type,
        payload: {
          sellerOrderId: p.sellerOrderId,
          orderId: p.orderId,
          subtotalMinor: p.subtotalMinor,
        },
      };
    }
    case 'seller-order.status_changed': {
      const p = (event as PublishedEvent<'seller-order.status_changed'>).payload;
      if (p.reason === PAYMENT_FAILED_REASON) {
        return null;
      }
      return {
        userId: p.buyerId,
        type: event.type,
        payload: {
          sellerOrderId: p.sellerOrderId,
          orderId: p.orderId,
          status: p.to,
          orderStatus: p.orderStatus,
          reason: p.reason,
        },
      };
    }
    case 'order.payment_failed': {
      const p = (event as PublishedEvent<'order.payment_failed'>).payload;
      return {
        userId: p.buyerId,
        type: event.type,
        payload: { orderId: p.orderId, reason: p.reason },
      };
    }
    default:
      return null;
  }
}
