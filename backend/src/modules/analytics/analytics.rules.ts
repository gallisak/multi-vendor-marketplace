export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PERIOD_DAYS = 30;
export const MAX_PERIOD_DAYS = 366;

export interface Period {
  from: Date;
  toExclusive: Date;
  days: number;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || isoDay(date) !== value) {
    throw new RangeError('from and to must be real dates in YYYY-MM-DD format');
  }
  return date;
}

export function resolvePeriod(from: string | undefined, to: string | undefined, now: Date): Period {
  const end = to ? parseDay(to) : startOfUtcDay(now);
  const start = from
    ? parseDay(from)
    : new Date(end.getTime() - (DEFAULT_PERIOD_DAYS - 1) * DAY_MS);
  if (start > end) {
    throw new RangeError('from must not be after to');
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days > MAX_PERIOD_DAYS) {
    throw new RangeError(`The period cannot be longer than ${MAX_PERIOD_DAYS} days`);
  }
  return { from: start, toExclusive: new Date(end.getTime() + DAY_MS), days };
}

export function previousPeriod(period: Period): Period {
  return {
    from: new Date(period.from.getTime() - period.days * DAY_MS),
    toExclusive: period.from,
    days: period.days,
  };
}

export function fillDays<T extends { day: string }>(
  rows: T[],
  period: Period,
  empty: (day: string) => T,
): T[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: period.days }, (_, i) => {
    const day = isoDay(new Date(period.from.getTime() + i * DAY_MS));
    return byDay.get(day) ?? empty(day);
  });
}

export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

export function ratePercent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10_000) / 100;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          typeof value === 'bigint'
        ? String(value)
        : JSON.stringify(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}
