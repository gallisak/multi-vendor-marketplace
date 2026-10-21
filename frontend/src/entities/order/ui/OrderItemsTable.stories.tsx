import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/shared/ui/button';
import { OrderItemsTable } from './OrderItemsTable';

const meta = {
  title: 'Entities/OrderItemsTable',
  component: OrderItemsTable,
  args: {
    items: [
      {
        id: 'i1',
        productId: 'p1',
        title: 'Wireless headphones',
        unitPriceMinor: 189_900,
        quantity: 3,
        refundedQuantity: 1,
        lineTotalMinor: 569_700,
      },
      {
        id: 'i2',
        productId: 'p2',
        title: 'USB-C cable 2m',
        unitPriceMinor: 29_900,
        quantity: 2,
        refundedQuantity: 0,
        lineTotalMinor: 59_800,
      },
    ],
  },
} satisfies Meta<typeof OrderItemsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPartialRefund: Story = {};

export const WithRowAction: Story = {
  args: {
    action: () => (
      <Button size="sm" variant="ghost">
        Refund
      </Button>
    ),
  },
};
