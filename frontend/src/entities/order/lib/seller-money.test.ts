import type { SellerOrder } from '@/shared/api';
import { netCommission } from './seller-money';

const order = (overrides: Partial<SellerOrder>) =>
  ({ subtotalMinor: 569_700, refundedMinor: 0, payoutMinor: 512_730, ...overrides }) as SellerOrder;

describe('netCommission', () => {
  it('is the full commission when nothing was refunded', () => {
    expect(netCommission(order({}))).toBe(56_970);
  });

  it('shrinks with the commission reversed on a partial refund', () => {
    expect(netCommission(order({ refundedMinor: 189_900, payoutMinor: 341_820 }))).toBe(37_980);
  });

  it('is zero for a cancelled order with everything refunded', () => {
    expect(netCommission(order({ refundedMinor: 569_700, payoutMinor: 0 }))).toBe(0);
  });
});
