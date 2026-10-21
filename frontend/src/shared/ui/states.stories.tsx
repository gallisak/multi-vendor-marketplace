import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApiError } from '@/shared/api';
import { Button } from './button';
import { EmptyState, ErrorState, LoadingState } from './states';

const meta = {
  title: 'Shared/States',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <LoadingState rows={3} />,
};

export const Empty: Story = {
  render: () => (
    <EmptyState
      title="Your cart is empty"
      description="Add something from the catalog to check out."
      action={<Button size="sm">Browse the catalog</Button>}
    />
  ),
};

export const ApiFailure: Story = {
  render: () => (
    <ErrorState
      error={new ApiError(503, 'Search is temporarily unavailable', [], 'b1d6c2f0-req')}
      onRetry={() => undefined}
    />
  ),
};

export const ValidationFailure: Story = {
  render: () => (
    <ErrorState
      error={
        new ApiError(400, 'title must be longer than 3 characters', [
          'title must be longer than 3 characters',
          'priceMinor must be a positive number',
        ])
      }
    />
  ),
};
