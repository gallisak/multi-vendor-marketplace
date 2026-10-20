import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import { LedgerEntryType } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import type { EntryDraft } from './ledger.rules.js';

export interface EntryOwner {
  sellerId: string;
  sellerOrderId?: string;
  refundId?: string;
  payoutId?: string;
}

@Injectable()
export class LedgerRepository extends PrismaRepository {
  async add(owner: EntryOwner, entries: EntryDraft[], tx: Transaction) {
    if (entries.length === 0) {
      return;
    }
    await tx.ledgerEntry.createMany({
      data: entries.map((entry) => ({ ...owner, ...entry })),
    });
  }

  async sellersDueForPayout(cutoff: Date) {
    const rows = await this.prisma.$queryRaw<{ sellerId: string }[]>`
      SELECT l.seller_id AS "sellerId"
      FROM ledger_entries l
      JOIN seller_orders so ON so.id = l.seller_order_id
      WHERE l.payout_id IS NULL AND so.status = 'COMPLETED' AND so.completed_at <= ${cutoff}
      GROUP BY l.seller_id
      HAVING SUM(l.amount_minor) > 0`;
    return rows.map((row) => row.sellerId);
  }

  async lockSeller(sellerId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ userId: string }[]>`
      SELECT user_id AS "userId" FROM sellers WHERE id = ${sellerId}::uuid
      FOR UPDATE SKIP LOCKED`;
    return rows[0] ?? null;
  }

  unsettledDue(sellerId: string, cutoff: Date, tx: Transaction) {
    return tx.$queryRaw<{ id: string; amountMinor: bigint }[]>`
      SELECT l.id, l.amount_minor AS "amountMinor"
      FROM ledger_entries l
      JOIN seller_orders so ON so.id = l.seller_order_id
      WHERE l.seller_id = ${sellerId}::uuid AND l.payout_id IS NULL
        AND so.status = 'COMPLETED' AND so.completed_at <= ${cutoff}
      ORDER BY l.id
      FOR UPDATE OF l`;
  }

  createPayout(
    data: { sellerId: string; amountMinor: bigint; providerRef: string },
    tx: Transaction,
  ) {
    return tx.payout.create({ data });
  }

  async settle(entryIds: string[], payoutId: string, tx: Transaction) {
    await tx.ledgerEntry.updateMany({ where: { id: { in: entryIds } }, data: { payoutId } });
  }

  async balances(sellerId: string) {
    const [row] = await this.prisma.$queryRaw<{ pending: bigint; paidOut: bigint }[]>`
      SELECT
        COALESCE(SUM(amount_minor) FILTER (WHERE type <> 'PAYOUT' AND payout_id IS NULL), 0)::bigint
          AS pending,
        COALESCE(-SUM(amount_minor) FILTER (WHERE type = 'PAYOUT'), 0)::bigint AS "paidOut"
      FROM ledger_entries
      WHERE seller_id = ${sellerId}::uuid`;
    return row;
  }

  findPayoutPage(sellerId: string | undefined, paging: Paging) {
    const where = sellerId ? { sellerId } : {};
    return this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: { select: { storeName: true } },
          _count: { select: { entries: { where: { type: { not: LedgerEntryType.PAYOUT } } } } },
        },
        ...paging,
      }),
      this.prisma.payout.count({ where }),
    ]);
  }
}
