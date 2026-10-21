import type { Meta, StoryObj } from '@storybook/react-vite';
import { formatMoney } from '@/shared/lib';
import { StatTile } from './stat-tile';

const meta = {
  title: 'Shared/StatTile',
  component: StatTile,
  args: {
    label: 'Platform revenue',
    value: formatMoney(917_910),
    hint: 'Commission after refunds',
  },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Money: Story = {};

export const Row: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Net sales" value={formatMoney(8_859_300)} hint="₴961.89 gross" />
      <StatTile label="Paid orders" value={7} />
      <StatTile label="Cart → order conversion" value="42%" hint="21 of 50 users with a cart" />
    </div>
  ),
};
