export type ProductChangeReason =
  | 'created'
  | 'updated'
  | 'stock_changed'
  | 'archived'
  | 'approved'
  | 'rejected'
  | 'bid_placed'
  | 'auction_closed'
  | 'auction_relisted';

export interface DomainEventPayloads {
  'product.changed': { productId: string; reason: ProductChangeReason };
  'category.changed': { categoryId: string };
  'seller.approved': { sellerId: string; userId: string; storeName: string };
  'order.placed': {
    orderId: string;
    buyerId: string;
    totalMinor: string;
    sellerOrders: { sellerOrderId: string; sellerId: string }[];
  };
  'order.payment_captured': { orderId: string; buyerId: string; amountMinor: string };
  'order.payment_failed': { orderId: string; buyerId: string; reason: string };
  'payout.paid': { payoutId: string; sellerId: string; sellerUserId: string; amountMinor: string };
  'seller-order.paid': {
    sellerOrderId: string;
    orderId: string;
    sellerId: string;
    sellerUserId: string;
    subtotalMinor: string;
  };
  'seller-order.status_changed': {
    sellerOrderId: string;
    orderId: string;
    sellerId: string;
    buyerId: string;
    from: string;
    to: string;
    orderStatus: string;
    reason: string | null;
  };
  'auction.bid_placed': {
    auctionId: string;
    productId: string;
    bidderId: string;
    previousLeaderId: string | null;
    amountMinor: number;
    bidCount: number;
    minNextBidMinor: number;
    endsAt: string;
  };
  'auction.closed': {
    auctionId: string;
    productId: string;
    title: string;
    sellerUserId: string;
    outcome: 'won' | 'unsold';
    winnerId: string | null;
    amountMinor: number | null;
    checkoutDeadline: string | null;
  };
  'auction.relisted': {
    auctionId: string;
    productId: string;
    title: string;
    sellerUserId: string;
    previousWinnerId: string | null;
    endsAt: string;
    reason: 'checkout_expired' | 'order_cancelled';
  };
  'payment.refund_requested': {
    orderId: string;
    buyerId: string;
    sellerOrderId: string;
    refundId: string | null;
    amountMinor: string;
    reason: string;
  };
}

export type DomainEventType = keyof DomainEventPayloads;

export interface NewDomainEvent<T extends DomainEventType = DomainEventType> {
  type: T;
  aggregateType: string;
  aggregateId: string;
  payload: DomainEventPayloads[T];
}

export interface PublishedEvent<
  T extends DomainEventType = DomainEventType,
> extends NewDomainEvent<T> {
  id: string;
  correlationId: string | null;
  occurredAt: string;
}

export const productChanged = (
  productId: string,
  reason: ProductChangeReason,
): NewDomainEvent<'product.changed'> => ({
  type: 'product.changed',
  aggregateType: 'product',
  aggregateId: productId,
  payload: { productId, reason },
});

export const categoryChanged = (categoryId: string): NewDomainEvent<'category.changed'> => ({
  type: 'category.changed',
  aggregateType: 'category',
  aggregateId: categoryId,
  payload: { categoryId },
});

export const sellerApproved = (
  payload: DomainEventPayloads['seller.approved'],
): NewDomainEvent<'seller.approved'> => ({
  type: 'seller.approved',
  aggregateType: 'seller',
  aggregateId: payload.sellerId,
  payload,
});

export const orderPlaced = (
  payload: DomainEventPayloads['order.placed'],
): NewDomainEvent<'order.placed'> => ({
  type: 'order.placed',
  aggregateType: 'order',
  aggregateId: payload.orderId,
  payload,
});

export const paymentCaptured = (
  payload: DomainEventPayloads['order.payment_captured'],
): NewDomainEvent<'order.payment_captured'> => ({
  type: 'order.payment_captured',
  aggregateType: 'order',
  aggregateId: payload.orderId,
  payload,
});

export const paymentFailed = (
  payload: DomainEventPayloads['order.payment_failed'],
): NewDomainEvent<'order.payment_failed'> => ({
  type: 'order.payment_failed',
  aggregateType: 'order',
  aggregateId: payload.orderId,
  payload,
});

export const sellerOrderPaid = (
  payload: DomainEventPayloads['seller-order.paid'],
): NewDomainEvent<'seller-order.paid'> => ({
  type: 'seller-order.paid',
  aggregateType: 'seller-order',
  aggregateId: payload.sellerOrderId,
  payload,
});

export const sellerOrderStatusChanged = (
  payload: DomainEventPayloads['seller-order.status_changed'],
): NewDomainEvent<'seller-order.status_changed'> => ({
  type: 'seller-order.status_changed',
  aggregateType: 'seller-order',
  aggregateId: payload.sellerOrderId,
  payload,
});

export const refundRequested = (
  payload: DomainEventPayloads['payment.refund_requested'],
): NewDomainEvent<'payment.refund_requested'> => ({
  type: 'payment.refund_requested',
  aggregateType: 'order',
  aggregateId: payload.orderId,
  payload,
});

export const bidPlaced = (
  payload: DomainEventPayloads['auction.bid_placed'],
): NewDomainEvent<'auction.bid_placed'> => ({
  type: 'auction.bid_placed',
  aggregateType: 'auction',
  aggregateId: payload.auctionId,
  payload,
});

export const auctionClosed = (
  payload: DomainEventPayloads['auction.closed'],
): NewDomainEvent<'auction.closed'> => ({
  type: 'auction.closed',
  aggregateType: 'auction',
  aggregateId: payload.auctionId,
  payload,
});

export const auctionRelisted = (
  payload: DomainEventPayloads['auction.relisted'],
): NewDomainEvent<'auction.relisted'> => ({
  type: 'auction.relisted',
  aggregateType: 'auction',
  aggregateId: payload.auctionId,
  payload,
});

export const payoutPaid = (
  payload: DomainEventPayloads['payout.paid'],
): NewDomainEvent<'payout.paid'> => ({
  type: 'payout.paid',
  aggregateType: 'payout',
  aggregateId: payload.payoutId,
  payload,
});
