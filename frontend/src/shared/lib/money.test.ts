import { formatMoney, MONEY_PATTERN, toMajor, toMinor } from './money';
import { timeLeft } from './format';

describe('money helpers', () => {
  it('converts between major and minor units without float drift', () => {
    expect(toMinor('19.99')).toBe(1999);
    expect(toMinor('0,1')).toBe(10);
    expect(toMinor(1234.565)).toBe(123457);
    expect(toMajor(150)).toBe('1.50');
  });

  it('accepts amounts with up to two decimals', () => {
    expect(['10', '10.5', '10,55'].every((value) => MONEY_PATTERN.test(value))).toBe(true);
    expect(['10.555', '-1', '1e3', ''].some((value) => MONEY_PATTERN.test(value))).toBe(false);
  });

  it('formats hryvnias', () => {
    expect(formatMoney(1_899_900)).toBe('₴18,999.00');
  });
});

describe('timeLeft', () => {
  const now = Date.UTC(2026, 9, 21, 12, 0, 0);
  it('switches units as the deadline approaches', () => {
    expect(timeLeft(new Date(now + 2 * 86_400_000 + 3 * 3600_000), now)).toBe('2d 3h');
    expect(timeLeft(new Date(now + 90 * 60_000), now)).toBe('1h 30m');
    expect(timeLeft(new Date(now + 65_000), now)).toBe('1m 05s');
    expect(timeLeft(new Date(now - 1), now)).toBe('ended');
  });
});
