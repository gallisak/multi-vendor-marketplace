import { LedgerEntryType } from '../../generated/prisma/enums.js';

export interface EntryDraft {
  type: LedgerEntryType;
  amountMinor: bigint;
}

const nonZero = (entries: EntryDraft[]) => entries.filter((entry) => entry.amountMinor !== 0n);

export function saleEntries(subtotalMinor: bigint, commissionMinor: bigint): EntryDraft[] {
  return [
    { type: LedgerEntryType.SALE, amountMinor: subtotalMinor },
    { type: LedgerEntryType.COMMISSION, amountMinor: -commissionMinor },
  ];
}

export function cancellationEntries(openSubtotalMinor: bigint, openCommissionMinor: bigint) {
  return nonZero([
    { type: LedgerEntryType.CANCELLATION, amountMinor: -openSubtotalMinor },
    { type: LedgerEntryType.COMMISSION_CANCELLATION, amountMinor: openCommissionMinor },
  ]);
}

export function reversedCommission(refunds: { commissionReversalMinor: bigint }[]): bigint {
  return refunds.reduce((sum, refund) => sum + refund.commissionReversalMinor, 0n);
}

export function openCommission(sellerOrder: {
  commissionMinor: bigint;
  refunds: { commissionReversalMinor: bigint }[];
}): bigint {
  return sellerOrder.commissionMinor - reversedCommission(sellerOrder.refunds);
}

export function payoutAmount(entries: { amountMinor: bigint }[]): bigint {
  return entries.reduce((sum, entry) => sum + entry.amountMinor, 0n);
}
