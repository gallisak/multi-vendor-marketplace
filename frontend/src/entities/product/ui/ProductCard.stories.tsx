import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProductCard } from './ProductCard';

const meta = {
  title: 'Entities/ProductCard',
  component: ProductCard,
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
  args: {
    product: {
      id: 'p1',
      title: 'Smartphone X12 128GB',
      priceMinor: 1_899_900,
      imageUrl: null,
      sellerName: 'Tech Store',
      ratingAvg: 4.5,
      ratingCount: 12,
      inStock: true,
      stock: 14,
    },
  },
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InStock: Story = {};

export const LowStock: Story = {
  args: { product: { ...meta.args.product, stock: 2 } },
};

export const SoldOut: Story = {
  args: { product: { ...meta.args.product, stock: 0, inStock: false } },
};

export const Auction: Story = {
  args: {
    product: {
      ...meta.args.product,
      title: 'Vintage film camera',
      priceMinor: 50_000,
      stock: 1,
      auctionEndsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    },
  },
};
