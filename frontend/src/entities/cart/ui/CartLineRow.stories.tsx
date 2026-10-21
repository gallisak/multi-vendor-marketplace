import type { Meta, StoryObj } from '@storybook/react-vite';
import { CartLineRow } from './CartLineRow';

const meta = {
  title: 'Entities/CartLineRow',
  component: CartLineRow,
  decorators: [
    (Story) => (
      <ul className="max-w-xl divide-y rounded-xl border px-4">
        <Story />
      </ul>
    ),
  ],
  args: {
    onQuantity: () => undefined,
    line: {
      productId: 'p1',
      title: 'Designing Data-Intensive Applications',
      imageUrl: null,
      unitPriceMinor: 159_900,
      quantity: 2,
      lineTotalMinor: 319_800,
      stock: 6,
      available: true,
      unavailableReason: null,
    },
  },
} satisfies Meta<typeof CartLineRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};

export const NotEnoughStock: Story = {
  args: {
    line: {
      ...meta.args.line,
      quantity: 4,
      stock: 2,
      available: false,
      unavailableReason: 'INSUFFICIENT_STOCK',
    },
  },
};

export const ArchivedBySeller: Story = {
  args: {
    line: { ...meta.args.line, available: false, unavailableReason: 'ARCHIVED' },
  },
};
