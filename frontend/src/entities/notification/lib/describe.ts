import type { Notification } from '@/shared/api';
import { formatMoney } from '@/shared/lib';

const money = (value: string | null | undefined) => (value ? formatMoney(Number(value)) : '');

export function describeNotification(notification: Notification): { text: string; link?: string } {
  const p = notification.payload;
  switch (notification.type) {
    case 'seller.approved':
      return { text: `Your store "${p.storeName}" was approved, you can start selling`, link: '/seller' };
    case 'seller-order.paid':
      return { text: `New paid order for ${money(p.subtotalMinor)}`, link: `/seller/orders/${p.sellerOrderId}` };
    case 'seller-order.status_changed':
      return {
        text: `Your order part is now ${p.to?.toLowerCase().replaceAll('_', ' ')}`,
        link: `/account/orders/${p.orderId}`,
      };
    case 'order.payment_failed':
      return { text: 'Payment failed, the order was cancelled', link: `/account/orders/${p.orderId}` };
    case 'payment.refund_requested':
      return { text: `Refund of ${money(p.amountMinor)} is on its way`, link: `/account/orders/${p.orderId}` };
    case 'auction.outbid':
      return { text: `You were outbid on "${p.title}"`, link: `/products/${p.productId}` };
    case 'auction.won':
      return { text: `You won "${p.title}", check out before the deadline`, link: `/products/${p.productId}` };
    case 'auction.closed':
      return { text: `Auction "${p.title}" ended (${p.outcome})`, link: `/products/${p.productId}` };
    case 'auction.relisted':
      return { text: `"${p.title}" is back on sale`, link: `/products/${p.productId}` };
    case 'auction.checkout_expired':
      return { text: `The checkout window for "${p.title}" expired`, link: `/products/${p.productId}` };
    case 'dispute.opened':
      return { text: 'A buyer opened a dispute', link: '/seller/disputes' };
    case 'dispute.resolved':
      return { text: 'A dispute was resolved', link: `/account/orders/${p.orderId}` };
    case 'payout.paid':
      return { text: `Payout of ${money(p.amountMinor)} was sent`, link: '/seller/payouts' };
    case 'user.google_linked':
      return { text: `Google sign-in was linked to ${p.email}` };
    default:
      return { text: notification.type };
  }
}
