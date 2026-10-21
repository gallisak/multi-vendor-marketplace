import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from './status-badge';

const meta = {
  title: 'Shared/StatusBadge',
  component: StatusBadge,
  args: { status: 'PARTIALLY_SHIPPED' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const OrderFlow: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[
        'NEW',
        'PROCESSING',
        'PARTIALLY_SHIPPED',
        'SHIPPED',
        'PARTIALLY_COMPLETED',
        'COMPLETED',
        'CANCELLED',
      ].map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};

export const PaymentsAndModeration: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[
        'PENDING',
        'CAPTURED',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
        'FAILED',
        'PENDING_MODERATION',
        'ACTIVE',
        'REJECTED',
        'OPEN',
        'RESOLVED_FOR_BUYER',
      ].map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
