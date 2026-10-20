import { Injectable } from '@nestjs/common';
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
}
