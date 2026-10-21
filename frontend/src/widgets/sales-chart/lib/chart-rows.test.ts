import { toChartRows } from './chart-rows';

describe('toChartRows', () => {
  it('aligns both periods day by day and nets out refunds', () => {
    const rows = toChartRows({
      current: [
        { day: '2026-10-20', grossMinor: 10_000, refundedMinor: 2_000, ordersCount: 2 },
        { day: '2026-10-21', grossMinor: 5_000, refundedMinor: 0, ordersCount: 1 },
      ],
      previous: [{ day: '2026-09-20', grossMinor: 3_000, refundedMinor: 0, ordersCount: 1 }],
      totals: { currentNetMinor: 13_000, previousNetMinor: 3_000, changePercent: 333.3 },
    });
    expect(rows).toEqual([
      {
        index: 0,
        currentDay: '2026-10-20',
        previousDay: '2026-09-20',
        current: 8_000,
        previous: 3_000,
        currentOrders: 2,
        previousOrders: 1,
      },
      {
        index: 1,
        currentDay: '2026-10-21',
        previousDay: '',
        current: 5_000,
        previous: 0,
        currentOrders: 1,
        previousOrders: 0,
      },
    ]);
  });
});
