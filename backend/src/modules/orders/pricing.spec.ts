import { commissionFor, lineTotal, percentToBps, PricedLine, splitBySeller } from './pricing.js';

const line = (sellerId: string, unitPriceMinor: number, quantity: number): PricedLine => ({
  productId: `${sellerId}-${unitPriceMinor}`,
  sellerId,
  title: 'Item',
  unitPriceMinor,
  quantity,
});

describe('commissionFor', () => {
  it('takes the rate in basis points', () => {
    expect(commissionFor(100_000n, 1000)).toBe(10_000n);
    expect(commissionFor(100_000n, 250)).toBe(2_500n);
  });

  it('rounds half up to the nearest kopeck', () => {
    expect(commissionFor(1_005n, 1000)).toBe(101n);
    expect(commissionFor(1_004n, 1000)).toBe(100n);
  });

  it('supports zero and full rates', () => {
    expect(commissionFor(12_345n, 0)).toBe(0n);
    expect(commissionFor(12_345n, 10_000)).toBe(12_345n);
  });

  it('does not overflow on large amounts', () => {
    expect(commissionFor(9_000_000_000_000n, 1000)).toBe(900_000_000_000n);
  });
});

describe('percentToBps', () => {
  it('converts percent to basis points', () => {
    expect(percentToBps(10)).toBe(1000);
    expect(percentToBps(2.5)).toBe(250);
  });
});

describe('lineTotal', () => {
  it('multiplies in bigint', () => {
    expect(lineTotal({ unitPriceMinor: 1_000_000_000, quantity: 5 })).toBe(5_000_000_000n);
  });
});

describe('splitBySeller', () => {
  it('creates one seller order per seller with its own commission line', () => {
    const draft = splitBySeller(
      [line('seller-b', 50_000, 1), line('seller-a', 10_000, 2), line('seller-a', 3_333, 3)],
      1000,
    );

    expect(draft.sellerOrders.map((o) => o.sellerId)).toEqual(['seller-a', 'seller-b']);
    expect(draft.sellerOrders[0]).toMatchObject({
      subtotalMinor: 29_999n,
      commissionRateBps: 1000,
      commissionMinor: 3_000n,
    });
    expect(draft.sellerOrders[0].lines).toHaveLength(2);
    expect(draft.sellerOrders[1]).toMatchObject({
      subtotalMinor: 50_000n,
      commissionMinor: 5_000n,
    });
  });

  it('keeps order totals equal to the sum of seller orders', () => {
    const draft = splitBySeller(
      [line('a', 1_005, 1), line('b', 1_005, 1), line('c', 1_005, 1)],
      1000,
    );

    expect(draft.totalMinor).toBe(3_015n);
    expect(draft.commissionMinor).toBe(303n);
    expect(draft.commissionMinor).toBe(
      draft.sellerOrders.reduce((sum, o) => sum + o.commissionMinor, 0n),
    );
  });

  it('returns an empty draft for no lines', () => {
    expect(splitBySeller([], 1000)).toEqual({
      sellerOrders: [],
      totalMinor: 0n,
      commissionMinor: 0n,
    });
  });
});
