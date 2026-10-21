const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'UAH',
  currencyDisplay: 'narrowSymbol',
});

export function formatMoney(minor: number): string {
  return formatter.format(minor / 100);
}

export function toMinor(major: string | number): number {
  const value = typeof major === 'number' ? major : Number(major.replace(',', '.'));
  return Math.round(value * 100);
}

export function toMajor(minor: number): string {
  return (minor / 100).toFixed(2);
}
