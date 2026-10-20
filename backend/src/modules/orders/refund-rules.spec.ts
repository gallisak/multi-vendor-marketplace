import { PaymentStatus } from '../../generated/prisma/enums.js';
import {
  assertPaid,
  calculateRefund,
  paymentStatusAfterRefund,
  RefundableSellerOrder,
  refundableQuantity,
} from './refund-rules.js';

const item = { unitPriceMinor: 3_333, quantity: 3, refundedQuantity: 0 };
const sellerOrder = (overrides: Partial<RefundableSellerOrder> = {}): RefundableSellerOrder => ({
  subtotalMinor: 9_999n,
  commissionMinor: 1_000n,
  commissionRateBps: 1000,
  refundedMinor: 0n,
  reversedCommissionMinor: 0n,
  ...overrides,
});

describe('calculateRefund', () => {
  it('refunds the unit price times quantity and reverses commission proportionally', () => {
    expect(calculateRefund(item, sellerOrder(), 1)).toEqual({
      amountMinor: 3_333n,
      commissionReversalMinor: 333n,
    });
  });

  it('reverses exactly the remaining commission on the refund that settles the seller order', () => {
    const afterTwo = sellerOrder({ refundedMinor: 6_666n, reversedCommissionMinor: 667n });

    expect(
      calculateRefund({ ...item, refundedQuantity: 2 }, afterTwo, 1).commissionReversalMinor,
    ).toBe(333n);
  });

  it('never reverses more commission than was charged even with rounding', () => {
    let state = sellerOrder();
    let refundedQuantity = 0;
    let reversedTotal = 0n;
    for (let i = 0; i < 3; i++) {
      const refund = calculateRefund({ ...item, refundedQuantity }, state, 1);
      reversedTotal += refund.commissionReversalMinor;
      refundedQuantity += 1;
      state = {
        ...state,
        refundedMinor: state.refundedMinor + refund.amountMinor,
        reversedCommissionMinor: state.reversedCommissionMinor + refund.commissionReversalMinor,
      };
    }

    expect(reversedTotal).toBe(1_000n);
  });

  it('caps the reversal at what is left when earlier rounding already used it up', () => {
    const almostReversed = sellerOrder({
      subtotalMinor: 20_000n,
      refundedMinor: 9_999n,
      reversedCommissionMinor: 999n,
    });

    expect(calculateRefund(item, almostReversed, 1).commissionReversalMinor).toBe(1n);
  });

  it.each([0, -1, 4, 1.5])('rejects quantity %s', (quantity) => {
    expect(() => calculateRefund(item, sellerOrder(), quantity)).toThrow(RangeError);
  });

  it('rejects refunding more than what is left on the line', () => {
    expect(() => calculateRefund({ ...item, refundedQuantity: 2 }, sellerOrder(), 2)).toThrow(
      /between 1 and 1/,
    );
    expect(refundableQuantity({ ...item, refundedQuantity: 2 })).toBe(1);
  });
});

describe('paymentStatusAfterRefund', () => {
  it.each([
    [0n, PaymentStatus.CAPTURED],
    [500n, PaymentStatus.PARTIALLY_REFUNDED],
    [1_000n, PaymentStatus.REFUNDED],
  ])('refunded %s of 1000 -> %s', (refunded, status) => {
    expect(paymentStatusAfterRefund(1_000n, refunded)).toBe(status);
  });
});

describe('assertPaid', () => {
  it.each([
    [PaymentStatus.PENDING, /still being processed/],
    [PaymentStatus.FAILED, /not paid/],
    [PaymentStatus.REFUNDED, /already refunded/],
  ])('rejects %s', (status, message) => {
    expect(() => assertPaid(status)).toThrow(message);
  });

  it('accepts captured and partially refunded payments', () => {
    expect(() => assertPaid(PaymentStatus.CAPTURED)).not.toThrow();
    expect(() => assertPaid(PaymentStatus.PARTIALLY_REFUNDED)).not.toThrow();
  });
});
