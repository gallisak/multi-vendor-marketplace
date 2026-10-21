import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthContext, type AuthState } from '@/entities/viewer';
import { BidForm } from './BidForm';

const viewer: AuthState = {
  user: { id: 'u1', email: 'customer@mvm.local', name: 'Customer', role: 'CUSTOMER' },
  ready: true,
  login: () => Promise.reject(new Error('not available in Storybook')),
  register: () => Promise.reject(new Error('not available in Storybook')),
  logout: () => Promise.resolve(),
  completeOAuth: () => Promise.resolve(null),
  hasRole: () => true,
};

const meta = {
  title: 'Features/BidForm',
  component: BidForm,
  decorators: [
    (Story) => (
      <AuthContext.Provider value={viewer}>
        <div className="max-w-sm">
          <Story />
        </div>
      </AuthContext.Provider>
    ),
  ],
  args: { productId: 'p1', minimumMinor: 55_000 },
} satisfies Meta<typeof BidForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MinimumBid: Story = {};
export const HighAuction: Story = { args: { minimumMinor: 2_450_000 } };
