import type { PublishedEvent } from '../../common/events/domain-events.js';

export const PAYMENT_FAILED_REASON = 'payment_failed';

export interface NotificationDraft {
  userId: string;
  type: string;
  payload: Record<string, string | null>;
}

export function notificationsFor(event: PublishedEvent): NotificationDraft[] {
  switch (event.type) {
    case 'auction.closed': {
      const p = (event as PublishedEvent<'auction.closed'>).payload;
      const payload = {
        productId: p.productId,
        title: p.title,
        outcome: p.outcome,
        amountMinor: p.amountMinor === null ? null : String(p.amountMinor),
        checkoutDeadline: p.checkoutDeadline,
      };
      const seller = { userId: p.sellerUserId, type: event.type, payload };
      return p.winnerId ? [seller, { userId: p.winnerId, type: 'auction.won', payload }] : [seller];
    }
    case 'dispute.opened': {
      const p = (event as PublishedEvent<'dispute.opened'>).payload;
      return [
        {
          userId: p.sellerUserId,
          type: event.type,
          payload: { disputeId: p.disputeId, sellerOrderId: p.sellerOrderId, orderId: p.orderId },
        },
      ];
    }
    case 'dispute.resolved': {
      const p = (event as PublishedEvent<'dispute.resolved'>).payload;
      const payload = {
        disputeId: p.disputeId,
        sellerOrderId: p.sellerOrderId,
        orderId: p.orderId,
        status: p.status,
        refundedMinor: p.refundedMinor,
      };
      return [
        { userId: p.buyerId, type: event.type, payload },
        { userId: p.sellerUserId, type: event.type, payload },
      ];
    }
    case 'auction.relisted': {
      const p = (event as PublishedEvent<'auction.relisted'>).payload;
      const payload = {
        productId: p.productId,
        title: p.title,
        endsAt: p.endsAt,
        reason: p.reason,
      };
      const seller = { userId: p.sellerUserId, type: event.type, payload };
      return p.reason === 'checkout_expired' && p.previousWinnerId
        ? [seller, { userId: p.previousWinnerId, type: 'auction.checkout_expired', payload }]
        : [seller];
    }
    default: {
      const single = notificationFor(event);
      return single ? [single] : [];
    }
  }
}

export function notificationFor(event: PublishedEvent): NotificationDraft | null {
  switch (event.type) {
    case 'user.google_linked': {
      const { userId, email, passwordRemoved } = (event as PublishedEvent<'user.google_linked'>)
        .payload;
      return {
        userId,
        type: event.type,
        payload: { email, passwordRemoved: String(passwordRemoved) },
      };
    }
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
    case 'payment.refund_requested': {
      const p = (event as PublishedEvent<'payment.refund_requested'>).payload;
      return {
        userId: p.buyerId,
        type: event.type,
        payload: {
          orderId: p.orderId,
          sellerOrderId: p.sellerOrderId,
          amountMinor: p.amountMinor,
          reason: p.reason,
        },
      };
    }
    case 'auction.bid_placed': {
      const p = (event as PublishedEvent<'auction.bid_placed'>).payload;
      if (!p.previousLeaderId || p.previousLeaderId === p.bidderId) {
        return null;
      }
      return {
        userId: p.previousLeaderId,
        type: 'auction.outbid',
        payload: {
          productId: p.productId,
          amountMinor: String(p.amountMinor),
          minNextBidMinor: String(p.minNextBidMinor),
        },
      };
    }
    default:
      return null;
  }
}
