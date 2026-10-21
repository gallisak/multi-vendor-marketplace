import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { QuantityStepper } from './quantity-stepper';

const meta = {
  title: 'Shared/QuantityStepper',
  component: QuantityStepper,
  args: { value: 2, max: 5, onChange: () => undefined },
} satisfies Meta<typeof QuantityStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledStepper(props: Parameters<typeof QuantityStepper>[0]) {
  const [value, setValue] = useState(props.value);
  return <QuantityStepper {...props} value={value} onChange={setValue} />;
}

export const Interactive: Story = {
  render: (args) => <ControlledStepper {...args} />,
};

export const AtStockLimit: Story = { args: { value: 5, max: 5 } };
export const Disabled: Story = { args: { disabled: true } };
