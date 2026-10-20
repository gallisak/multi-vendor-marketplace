import { allocate } from './sales-projection.service.js';

describe('allocate', () => {
  it('splits commission by line value and never loses a minor unit', () => {
    expect(allocate(1n, [5n, 5n])).toEqual([0n, 1n]);
    expect(allocate(100n, [300n, 100n, 100n])).toEqual([60n, 20n, 20n]);
    expect(allocate(7n, [1n, 1n, 1n]).reduce((a, b) => a + b, 0n)).toBe(7n);
  });

  it('handles nothing to split', () => {
    expect(allocate(5n, [])).toEqual([]);
    expect(allocate(0n, [0n, 0n])).toEqual([0n, 0n]);
  });
});
