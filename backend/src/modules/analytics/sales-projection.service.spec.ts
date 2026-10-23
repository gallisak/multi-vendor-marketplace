import type { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import type { SalesDailyRepository } from './sales-daily.repository.js';
import { allocate, SalesProjectionService } from './sales-projection.service.js';

describe('allocate', () => {
  it('splits commission by line value and never loses a minor unit', () => {
    expect(allocate(1n, [5n, 5n])).toEqual([0n, 1n]);
    expect(allocate(100n, [300n, 100n, 100n])).toEqual([60n, 20n, 20n]);
    expect(allocate(7n, [1n, 1n, 1n]).reduce((a, b) => a + b, 0n)).toBe(7n);
  });

  it('handles nothing to split', () => {
    expect(allocate(5n, [])).toEqual([]);
    expect(allocate(0n, [0n, 0n])).toEqual([0n, 0n]);
  });
});

describe('SalesProjectionService.recordPayment', () => {
  it('books exactly the seller order commission, not a sum of rounded line commissions', async () => {
    const applied: { commissionMinor?: bigint }[] = [];
    const sales = {
      paidOrder: vi.fn(() =>
        Promise.resolve({
          createdAt: new Date('2026-10-20T10:00:00Z'),
          sellerOrders: [
            {
              sellerId: 's1',
              commissionMinor: 5n,
              commissionRateBps: 1_000,
              items: ['p1', 'p2', 'p3'].map((productId) => ({
                productId,
                unitPriceMinor: 15,
                quantity: 1,
              })),
            },
          ],
        }),
      ),
      apply: vi.fn((row: { commissionMinor?: bigint }) => {
        applied.push(row);
        return Promise.resolve();
      }),
    };
    const idempotent = {
      runOnce: (_consumer: string, _eventId: string, effect: (tx: unknown) => Promise<void>) =>
        effect({}),
    };
    const service = new SalesProjectionService(
      idempotent as unknown as IdempotentConsumerService,
      sales as unknown as SalesDailyRepository,
    );

    await service.recordPayment('e1', 'o1');

    expect(applied.reduce((sum, row) => sum + row.commissionMinor!, 0n)).toBe(5n);
  });
});
