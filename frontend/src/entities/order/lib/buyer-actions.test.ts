import type { BuyerSellerOrder, Dispute, Order } from '@/shared/api';
import { canCancelPart, canConfirmDelivery, canOpenDispute, canReviewItems } from './buyer-actions';

const part = (overrides: Partial<BuyerSellerOrder> = {}): BuyerSellerOrder => ({
  id: 's1',
  sellerId: 'seller',
  storeName: 'Tech Store',
  status: 'NEW',
  subtotalMinor: 10_000,
  refundedMinor: 0,
  cancelReason: null,
  items: [],
  ...overrides,
});

const order = (paymentStatus: Order['paymentStatus'] = 'CAPTURED'): Order => ({
  id: 'o1',
  status: 'NEW',
  paymentStatus,
  totalMinor: 10_000,
  refundedMinor: 0,
  sellerOrders: [],
  createdAt: '2026-10-21T10:00:00Z',
});

const dispute = { id: 'd1', sellerOrderId: 's1' } as Dispute;

describe('buyer actions on a seller order', () => {
  it('allows cancelling only a paid part the seller has not accepted yet', () => {
    expect(canCancelPart(order(), part())).toBe(true);
    expect(canCancelPart(order('PENDING'), part())).toBe(false);
    expect(canCancelPart(order(), part({ status: 'PROCESSING' }))).toBe(false);
    expect(canCancelPart(order('PARTIALLY_REFUNDED'), part())).toBe(true);
  });

  it('allows confirming delivery only for a shipped part', () => {
    expect(canConfirmDelivery(part({ status: 'SHIPPED' }))).toBe(true);
    expect(canConfirmDelivery(part({ status: 'PROCESSING' }))).toBe(false);
  });

  it('allows reviews only after the part is completed', () => {
    expect(canReviewItems(part({ status: 'COMPLETED' }))).toBe(true);
    expect(canReviewItems(part({ status: 'SHIPPED' }))).toBe(false);
  });

  it('allows one dispute per shipped or completed part that still has money to return', () => {
    expect(canOpenDispute(order(), part({ status: 'SHIPPED' }), undefined)).toBe(true);
    expect(canOpenDispute(order(), part({ status: 'COMPLETED' }), undefined)).toBe(true);
    expect(canOpenDispute(order(), part({ status: 'PROCESSING' }), undefined)).toBe(false);
    expect(canOpenDispute(order(), part({ status: 'SHIPPED' }), dispute)).toBe(false);
    expect(
      canOpenDispute(order(), part({ status: 'SHIPPED', refundedMinor: 10_000 }), undefined),
    ).toBe(false);
    expect(canOpenDispute(order('REFUNDED'), part({ status: 'SHIPPED' }), undefined)).toBe(false);
  });
});
