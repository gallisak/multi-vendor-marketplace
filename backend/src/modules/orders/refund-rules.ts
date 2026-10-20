import { ConflictException } from '@nestjs/common';
import { PaymentStatus } from '../../generated/prisma/enums.js';
import { commissionFor, lineTotal } from './pricing.js';

export interface RefundableItem {
  unitPriceMinor: number;
  quantity: number;
  refundedQuantity: number;
}

export interface RefundableSellerOrder {
  subtotalMinor: bigint;
  commissionMinor: bigint;
  commissionRateBps: number;
  refundedMinor: bigint;
  reversedCommissionMinor: bigint;
}

export interface RefundCalculation {
  amountMinor: bigint;
  commissionReversalMinor: bigint;
}

export function refundableQuantity(item: RefundableItem): number {
  return item.quantity - item.refundedQuantity;
}

export function calculateRefund(
  item: RefundableItem,
  sellerOrder: RefundableSellerOrder,
  quantity: number,
): RefundCalculation {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > refundableQuantity(item)) {
    throw new RangeError(`Refund quantity must be between 1 and ${refundableQuantity(item)}`);
  }

  const amountMinor = lineTotal({ unitPriceMinor: item.unitPriceMinor, quantity });
  const remainingCommission = sellerOrder.commissionMinor - sellerOrder.reversedCommissionMinor;
  const settlesSellerOrder = sellerOrder.refundedMinor + amountMinor === sellerOrder.subtotalMinor;
  const proportional = commissionFor(amountMinor, sellerOrder.commissionRateBps);

  return {
    amountMinor,
    commissionReversalMinor: settlesSellerOrder
      ? remainingCommission
      : proportional < remainingCommission
        ? proportional
        : remainingCommission,
  };
}

export function paymentStatusAfterRefund(paidMinor: bigint, refundedMinor: bigint): PaymentStatus {
  if (refundedMinor <= 0n) return PaymentStatus.CAPTURED;
  if (refundedMinor >= paidMinor) return PaymentStatus.REFUNDED;
  return PaymentStatus.PARTIALLY_REFUNDED;
}

export const REFUNDABLE_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.CAPTURED,
  PaymentStatus.PARTIALLY_REFUNDED,
];

export function assertPaid(paymentStatus: PaymentStatus) {
  if (!REFUNDABLE_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new ConflictException(
      paymentStatus === PaymentStatus.PENDING
        ? 'Payment is still being processed, try again shortly'
        : paymentStatus === PaymentStatus.REFUNDED
          ? 'Everything in this order is already refunded'
          : 'The order is not paid',
    );
  }
}
