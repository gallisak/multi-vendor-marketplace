import { LedgerEntryType } from '../../generated/prisma/enums.js';
import { saleEntries } from './ledger.rules.js';

describe('ledger rules', () => {
  it('books a sale and the platform commission as separate lines', () => {
    expect(saleEntries(10_000n, 1_000n)).toEqual([
      { type: LedgerEntryType.SALE, amountMinor: 10_000n },
      { type: LedgerEntryType.COMMISSION, amountMinor: -1_000n },
    ]);
  });
});
