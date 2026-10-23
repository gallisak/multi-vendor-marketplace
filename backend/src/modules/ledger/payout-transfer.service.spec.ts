import type { Counter } from 'prom-client';
import { PayoutStatus } from '../../generated/prisma/enums.js';
import type { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import type { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import type { LedgerRepository } from './ledger.repository.js';
import { PayoutTransferService } from './payout-transfer.service.js';

const TX = { tx: true } as unknown as Transaction;
const REQUEST = { payoutId: 'p1', sellerId: 's1', sellerUserId: 'u1', amountMinor: '7200' };

function setup(status: PayoutStatus | null, { markPaid = true } = {}) {
  const ledger = {
    findPayout: vi.fn(() =>
      Promise.resolve(status && { id: 'p1', sellerId: 's1', amountMinor: 7_200n, status }),
    ),
    markPayoutPaid: vi.fn(() => Promise.resolve(markPaid)),
  };
  const outbox = { add: vi.fn(() => Promise.resolve()) };
  const idempotent = {
    runOnce: vi.fn(
      async (_consumer: string, _eventId: string, effect: (tx: Transaction) => Promise<void>) => {
        await effect(TX);
        return true;
      },
    ),
  };
  const gateway = { transfer: vi.fn(() => Promise.resolve({ providerRef: 'ref_p1' })) };
  const counter = { inc: vi.fn() };
  const service = new PayoutTransferService(
    ledger as unknown as LedgerRepository,
    outbox as unknown as OutboxService,
    idempotent as unknown as IdempotentConsumerService,
    gateway,
    counter as unknown as Counter<string>,
  );
  return { service, ledger, outbox, gateway, counter };
}

describe('PayoutTransferService', () => {
  it('transfers a pending payout keyed by its id, marks it paid and announces it', async () => {
    const { service, ledger, outbox, gateway, counter } = setup(PayoutStatus.PENDING);

    await service.transfer('e1', REQUEST);

    expect(gateway.transfer).toHaveBeenCalledWith({
      idempotencyKey: 'p1',
      sellerId: 's1',
      amountMinor: 7_200n,
    });
    expect(ledger.markPayoutPaid).toHaveBeenCalledWith('p1', 'ref_p1', TX);
    expect(outbox.add).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ type: 'payout.paid', payload: REQUEST }),
    );
    expect(counter.inc).toHaveBeenCalledTimes(1);
  });

  it('does not call the provider again for a payout that is already paid', async () => {
    const { service, gateway } = setup(PayoutStatus.PAID);

    await service.transfer('e1', REQUEST);

    expect(gateway.transfer).not.toHaveBeenCalled();
  });

  it('announces nothing when another delivery already marked the payout paid', async () => {
    const { service, outbox, counter } = setup(PayoutStatus.PENDING, { markPaid: false });

    await service.transfer('e1', REQUEST);

    expect(outbox.add).not.toHaveBeenCalled();
    expect(counter.inc).not.toHaveBeenCalled();
  });

  it('lets the queue retry when the provider fails', async () => {
    const { service, gateway, ledger } = setup(PayoutStatus.PENDING);
    gateway.transfer.mockRejectedValueOnce(new Error('provider down'));

    await expect(service.transfer('e1', REQUEST)).rejects.toThrow('provider down');
    expect(ledger.markPayoutPaid).not.toHaveBeenCalled();
  });
});
