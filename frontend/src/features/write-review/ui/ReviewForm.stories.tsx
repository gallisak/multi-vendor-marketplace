import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewForm } from './ReviewForm';

const meta = {
  title: 'Features/ReviewForm',
  component: ReviewForm,
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
  args: { productId: 'p1' },
} satisfies Meta<typeof ReviewForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Inline: Story = { args: { bordered: false } };
