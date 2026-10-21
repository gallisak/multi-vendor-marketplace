import type { OrderItem, SellerOrder } from '@/shared/api';

const PAID = ['CAPTURED', 'PARTIALLY_REFUNDED'];

export const isSellerOrderPaid = (order: SellerOrder) => PAID.includes(order.paymentStatus);

export const canAccept = (order: SellerOrder) => isSellerOrderPaid(order) && order.status === 'NEW';

export const canShip = (order: SellerOrder) => order.status === 'PROCESSING';

export const canSellerCancel = (order: SellerOrder) =>
  isSellerOrderPaid(order) && (order.status === 'NEW' || order.status === 'PROCESSING');

export const refundableQuantity = (item: OrderItem) => item.quantity - item.refundedQuantity;

export const canRefund = (order: SellerOrder) =>
  isSellerOrderPaid(order) &&
  order.status !== 'CANCELLED' &&
  order.items.some((item) => refundableQuantity(item) > 0);

export const restockIsOptional = (order: SellerOrder) =>
  order.status === 'SHIPPED' || order.status === 'COMPLETED';
