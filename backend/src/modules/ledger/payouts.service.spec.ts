import { LedgerEntryType } from '../../generated/prisma/enums.js';
import type { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import type { LedgerRepository } from './ledger.repository.js';
import type { LedgerService } from './ledger.service.js';
import { PayoutsService } from './payouts.service.js';

const TX = { tx: true } as unknown as Transaction;
const CUTOFF = new Date('2026-10-14T00:00:00Z');

function setup(due: Record<string, bigint[] | 'locked'>) {
  const ledger = {
    sellersDueForPayout: vi.fn(() => Promise.resolve(Object.keys(due))),
    lockSeller: vi.fn((sellerId: string) =>
      Promise.resolve(due[sellerId] === 'locked' ? null : { userId: `user-${sellerId}` }),
    ),
    unsettledDue: vi.fn((sellerId: string) => {
      const amounts = due[sellerId] as bigint[];
      return Promise.resolve(
        amounts.map((amountMinor, i) => ({ id: `${sellerId}-entry-${i}`, amountMinor })),
      );
    }),
    createPayout: vi.fn((data: { sellerId: string }) =>
      Promise.resolve({ id: `payout-${data.sellerId}` }),
    ),
    settle: vi.fn(() => Promise.resolve()),
    add: vi.fn(() => Promise.resolve()),
  };
  const outbox = { add: vi.fn(() => Promise.resolve()) };
  const uow = { run: (work: (tx: Transaction) => Promise<unknown>) => work(TX) };
  const service = new PayoutsService(
    ledger as unknown as LedgerRepository,
    {} as LedgerService,
    uow as unknown as UnitOfWork,
    outbox as unknown as OutboxService,
  );
  return { service, ledger, outbox };
}

describe('PayoutsService', () => {
  it('books the net of settled lines as a PAYOUT entry and queues the transfer', async () => {
    const { service, ledger, outbox } = setup({ s1: [9_000n, -2_250n, 450n] });

    expect(await service.payDue(CUTOFF)).toBe(1);

    expect(ledger.unsettledDue).toHaveBeenCalledWith('s1', CUTOFF, TX);
    expect(ledger.createPayout).toHaveBeenCalledWith({ sellerId: 's1', amountMinor: 7_200n }, TX);
    expect(ledger.settle).toHaveBeenCalledWith(
      ['s1-entry-0', 's1-entry-1', 's1-entry-2'],
      'payout-s1',
      TX,
    );
    expect(ledger.add).toHaveBeenCalledWith(
      { sellerId: 's1', payoutId: 'payout-s1' },
      [{ type: LedgerEntryType.PAYOUT, amountMinor: -7_200n }],
      TX,
    );
    expect(outbox.add).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        type: 'payout.requested',
        payload: {
          payoutId: 'payout-s1',
          sellerId: 's1',
          sellerUserId: 'user-s1',
          amountMinor: '7200',
        },
      }),
    );
  });

  it('carries a negative balance over instead of paying it', async () => {
    const { service, ledger } = setup({ s1: [1_000n, -3_000n] });

    expect(await service.payDue(CUTOFF)).toBe(0);
    expect(ledger.createPayout).not.toHaveBeenCalled();
    expect(ledger.settle).not.toHaveBeenCalled();
  });

  it('skips a seller another worker is already paying', async () => {
    const { service, ledger } = setup({ s1: 'locked', s2: [500n] });

    expect(await service.payDue(CUTOFF)).toBe(1);
    expect(ledger.unsettledDue).toHaveBeenCalledTimes(1);
    expect(ledger.createPayout).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: 's2' }),
      TX,
    );
  });

  it('keeps paying other sellers when one payout fails', async () => {
    const { service, ledger } = setup({ s1: [100n], s2: [200n] });
    ledger.createPayout.mockRejectedValueOnce(new Error('deadlock'));

    expect(await service.payDue(CUTOFF)).toBe(1);
    expect(ledger.createPayout).toHaveBeenCalledTimes(2);
  });
});
