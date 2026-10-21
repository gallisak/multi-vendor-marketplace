import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConnectionDot } from './connection-dot';

const meta = {
  title: 'Shared/ConnectionDot',
  component: ConnectionDot,
  args: { status: 'online' },
  argTypes: { status: { control: 'inline-radio', options: ['online', 'connecting', 'offline'] } },
} satisfies Meta<typeof ConnectionDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {};
export const Reconnecting: Story = { args: { status: 'connecting' } };
export const Offline: Story = { args: { status: 'offline' } };
