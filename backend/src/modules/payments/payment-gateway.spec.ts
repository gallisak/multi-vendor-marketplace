import { mockCharge } from './payment-gateway.js';

describe('mockCharge', () => {
  it('captures amounts within the limit with a stable provider reference', () => {
    const request = { idempotencyKey: 'order-1', amountMinor: 1_000n };

    expect(mockCharge(request, 1_000n)).toEqual({ ok: true, providerRef: 'mock_order-1' });
    expect(mockCharge(request, 1_000n)).toEqual(mockCharge(request, 1_000n));
  });

  it('declines amounts above the limit', () => {
    expect(mockCharge({ idempotencyKey: 'order-2', amountMinor: 1_001n }, 1_000n)).toEqual({
      ok: false,
      reason: expect.stringContaining('declined'),
    });
  });
});
