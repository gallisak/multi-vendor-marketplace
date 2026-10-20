import { LedgerEntryType } from '../../generated/prisma/enums.js';
import {
  cancellationEntries,
  openCommission,
  payoutAmount,
  refundEntries,
  saleEntries,
} from './ledger.rules.js';

const sum = (entries: { amountMinor: bigint }[]) =>
  entries.reduce((total, entry) => total + entry.amountMinor, 0n);

describe('ledger rules', () => {
  it('books a sale and the platform commission as separate lines', () => {
    expect(saleEntries(10_000n, 1_000n)).toEqual([
      { type: LedgerEntryType.SALE, amountMinor: 10_000n },
      { type: LedgerEntryType.COMMISSION, amountMinor: -1_000n },
    ]);
  });

  it('reverses the refunded part of the sale and its commission', () => {
    expect(refundEntries(2_500n, 250n)).toEqual([
      { type: LedgerEntryType.REFUND, amountMinor: -2_500n },
      { type: LedgerEntryType.COMMISSION_REVERSAL, amountMinor: 250n },
    ]);
    expect(refundEntries(5n, 0n)).toEqual([{ type: LedgerEntryType.REFUND, amountMinor: -5n }]);
  });

  it('cancels exactly what is still open so the seller order nets to zero', () => {
    const sale = saleEntries(10_000n, 1_000n);
    const refund = refundEntries(2_500n, 250n);
    const open = openCommission({
      commissionMinor: 1_000n,
      refunds: [{ commissionReversalMinor: 250n }],
    });
    const cancel = cancellationEntries(7_500n, open);

    expect(open).toBe(750n);
    expect(sum([...sale, ...refund, ...cancel])).toBe(0n);
    expect(cancellationEntries(0n, 0n)).toEqual([]);
  });

  it('pays out the net of all settled lines', () => {
    expect(payoutAmount([{ amountMinor: 9_000n }, { amountMinor: -2_250n }])).toBe(6_750n);
    expect(payoutAmount([])).toBe(0n);
  });
});
