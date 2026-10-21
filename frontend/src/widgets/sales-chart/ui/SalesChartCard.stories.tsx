import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient } from '@tanstack/react-query';
import type { SalesChart, SalesDay } from '@/shared/api';
import { SalesChartCard } from './SalesChartCard';

const DAY = 86_400_000;
const today = Date.UTC(2026, 9, 21);

function days(start: number, base: number, wave: number): SalesDay[] {
  return Array.from({ length: 30 }, (_, index) => {
    const gross = Math.round(base + wave * Math.sin(index / 3) + index * base * 0.01) * 100;
    return {
      day: new Date(start + index * DAY).toISOString().slice(0, 10),
      grossMinor: gross,
      refundedMinor: index % 6 === 0 ? Math.round(gross * 0.1) : 0,
      ordersCount: Math.max(1, Math.round(gross / 150_000)),
    };
  });
}

function seeded(chart: SalesChart) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['admin', 'sales-chart'], chart);
  return client;
}

const net = (list: SalesDay[]) =>
  list.reduce((sum, day) => sum + day.grossMinor - day.refundedMinor, 0);
const current = days(today - 29 * DAY, 9000, 2500);
const previous = days(today - 59 * DAY, 7000, 2000);

const meta = {
  title: 'Widgets/SalesChartCard',
  component: SalesChartCard,
} satisfies Meta<typeof SalesChartCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Growth: Story = {
  parameters: {
    queryClient: seeded({
      current,
      previous,
      totals: {
        currentNetMinor: net(current),
        previousNetMinor: net(previous),
        changePercent: ((net(current) - net(previous)) / net(previous)) * 100,
      },
    }),
  },
};

export const NoPreviousSales: Story = {
  parameters: {
    queryClient: seeded({
      current,
      previous: previous.map((day) => ({
        ...day,
        grossMinor: 0,
        refundedMinor: 0,
        ordersCount: 0,
      })),
      totals: { currentNetMinor: net(current), previousNetMinor: 0, changePercent: null },
    }),
  },
};
