import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { LedgerRepository } from './ledger.repository.js';
import { saleEntries } from './ledger.rules.js';

export interface BookedSellerOrder {
  id: string;
  sellerId: string;
  subtotalMinor: bigint;
  commissionMinor: bigint;
}

@Injectable()
export class LedgerService {
  constructor(private readonly ledger: LedgerRepository) {}

  async recordSales(sellerOrders: BookedSellerOrder[], tx: Transaction) {
    for (const sellerOrder of sellerOrders) {
      await this.ledger.add(
        { sellerId: sellerOrder.sellerId, sellerOrderId: sellerOrder.id },
        saleEntries(sellerOrder.subtotalMinor, sellerOrder.commissionMinor),
        tx,
      );
    }
  }
}
