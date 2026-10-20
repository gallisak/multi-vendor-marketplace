import { LedgerEntryType } from '../../generated/prisma/enums.js';

export interface EntryDraft {
  type: LedgerEntryType;
  amountMinor: bigint;
}

export function saleEntries(subtotalMinor: bigint, commissionMinor: bigint): EntryDraft[] {
  return [
    { type: LedgerEntryType.SALE, amountMinor: subtotalMinor },
    { type: LedgerEntryType.COMMISSION, amountMinor: -commissionMinor },
  ];
}
