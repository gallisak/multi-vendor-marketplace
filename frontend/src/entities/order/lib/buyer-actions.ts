import type { BuyerSellerOrder, Order } from '@/shared/api';

const PAID = ['CAPTURED', 'PARTIALLY_REFUNDED'];

export const isPaid = (order: Order) => PAID.includes(order.paymentStatus);

export const canCancelPart = (order: Order, part: BuyerSellerOrder) =>
  isPaid(order) && part.status === 'NEW';

export const canConfirmDelivery = (part: BuyerSellerOrder) => part.status === 'SHIPPED';

export const canReviewItems = (part: BuyerSellerOrder) => part.status === 'COMPLETED';

export const canOpenDispute = (order: Order, part: BuyerSellerOrder) =>
  isPaid(order) &&
  (part.status === 'SHIPPED' || part.status === 'COMPLETED') &&
  part.refundedMinor < part.subtotalMinor &&
  part.dispute === null;
