import {
  changePercent,
  csvCell,
  fillDays,
  previousPeriod,
  ratePercent,
  resolvePeriod,
  toCsv,
} from './analytics.rules.js';

const now = new Date('2026-10-20T15:30:00Z');

describe('resolvePeriod', () => {
  it.each(['2026-02-31', '2026-13-01', '2026-1-5'])(
    'rejects %s instead of rolling it over',
    (day) => {
      expect(() => resolvePeriod(day, '2026-10-01', now)).toThrow(/real dates/);
    },
  );

  it('defaults to the last 30 days including today', () => {
    const period = resolvePeriod(undefined, undefined, now);

    expect(period.from.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(period.toExclusive.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(period.days).toBe(30);
  });

  it('treats both bounds as whole days', () => {
    const period = resolvePeriod('2026-10-01', '2026-10-01', now);

    expect(period.days).toBe(1);
    expect(period.toExclusive.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it.each([
    ['2026-10-10', '2026-10-01', /not be after/],
    ['2025-01-01', '2026-10-01', /cannot be longer/],
    ['yesterday', undefined, /YYYY-MM-DD/],
  ])('rejects from=%s to=%s', (from, to, message) => {
    expect(() => resolvePeriod(from, to, now)).toThrow(message);
  });
});

describe('previousPeriod', () => {
  it('is the same length right before the period', () => {
    const period = resolvePeriod('2026-10-11', '2026-10-20', now);
    const previous = previousPeriod(period);

    expect(previous.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(previous.toExclusive).toEqual(period.from);
    expect(previous.days).toBe(10);
  });
});

describe('fillDays', () => {
  it('adds zero days and keeps order', () => {
    const period = resolvePeriod('2026-10-18', '2026-10-20', now);
    const filled = fillDays([{ day: '2026-10-19', gross: 5 }], period, (day) => ({
      day,
      gross: 0,
    }));

    expect(filled).toEqual([
      { day: '2026-10-18', gross: 0 },
      { day: '2026-10-19', gross: 5 },
      { day: '2026-10-20', gross: 0 },
    ]);
  });
});

describe('percentages', () => {
  it('computes change against the previous period', () => {
    expect(changePercent(150, 100)).toBe(50);
    expect(changePercent(50, 100)).toBe(-50);
    expect(changePercent(10, 0)).toBeNull();
  });

  it('computes a rate with two decimals', () => {
    expect(ratePercent(1, 3)).toBe(33.33);
    expect(ratePercent(0, 0)).toBe(0);
  });
});

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Book, "signed"')).toBe('"Book, ""signed"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(1500)).toBe('1500');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('serializes objects as JSON instead of [object Object]', () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('does not touch negative numbers', () => {
    expect(csvCell(-500)).toBe('-500');
  });

  it('renders a header and rows', () => {
    expect(toCsv(['a', 'b'], [{ a: 1, b: 'x' }, { a: 2 }])).toBe('a,b\r\n1,x\r\n2,\r\n');
  });
});
