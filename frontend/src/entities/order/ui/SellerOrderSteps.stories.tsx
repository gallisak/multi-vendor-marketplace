import type { Meta, StoryObj } from '@storybook/react-vite';
import { SellerOrderSteps } from './SellerOrderSteps';

const meta = {
  title: 'Entities/SellerOrderSteps',
  component: SellerOrderSteps,
  args: { status: 'PROCESSING' },
  argTypes: {
    status: {
      control: 'inline-radio',
      options: ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
    },
  },
} satisfies Meta<typeof SellerOrderSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Processing: Story = {};
export const Shipped: Story = { args: { status: 'SHIPPED' } };
export const Completed: Story = { args: { status: 'COMPLETED' } };
