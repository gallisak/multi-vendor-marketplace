import { LedgerEntryType } from '../../generated/prisma/enums.js';
import { cancellationEntries, openCommission, payoutAmount, saleEntries } from './ledger.rules.js';

const sum = (entries: { amountMinor: bigint }[]) =>
  entries.reduce((total, entry) => total + entry.amountMinor, 0n);

describe('ledger rules', () => {
  it('books a sale and the platform commission as separate lines', () => {
    expect(saleEntries(10_000n, 1_000n)).toEqual([
      { type: LedgerEntryType.SALE, amountMinor: 10_000n },
      { type: LedgerEntryType.COMMISSION, amountMinor: -1_000n },
    ]);
  });

  it('cancels exactly what is still open so the seller order nets to zero', () => {
    const open = openCommission({ commissionMinor: 1_000n, refunds: [] });

    expect(sum([...saleEntries(10_000n, 1_000n), ...cancellationEntries(10_000n, open)])).toBe(0n);
    expect(cancellationEntries(0n, 0n)).toEqual([]);
  });

  it('pays out the net of all settled lines', () => {
    expect(payoutAmount([{ amountMinor: 9_000n }, { amountMinor: -2_250n }])).toBe(6_750n);
    expect(payoutAmount([])).toBe(0n);
  });
});
