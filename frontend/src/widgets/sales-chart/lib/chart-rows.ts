import type { SalesChart } from '@/shared/api';

export interface ChartRow {
  index: number;
  currentDay: string;
  previousDay: string;
  current: number;
  previous: number;
  currentOrders: number;
  previousOrders: number;
}

export function toChartRows(chart: SalesChart): ChartRow[] {
  return chart.current.map((day, index) => {
    const previous = chart.previous[index];
    return {
      index,
      currentDay: day.day,
      previousDay: previous?.day ?? '',
      current: day.grossMinor - day.refundedMinor,
      previous: previous ? previous.grossMinor - previous.refundedMinor : 0,
      currentOrders: day.ordersCount,
      previousOrders: previous?.ordersCount ?? 0,
    };
  });
}
