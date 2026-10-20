import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import { LedgerRepository } from './ledger.repository.js';
import { cancellationEntries, refundEntries, saleEntries } from './ledger.rules.js';

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

  recordRefund(
    refund: {
      sellerId: string;
      sellerOrderId: string;
      refundId: string;
      amountMinor: bigint;
      commissionReversalMinor: bigint;
    },
    tx: Transaction,
  ) {
    return this.ledger.add(
      { sellerId: refund.sellerId, sellerOrderId: refund.sellerOrderId, refundId: refund.refundId },
      refundEntries(refund.amountMinor, refund.commissionReversalMinor),
      tx,
    );
  }

  recordCancellation(
    cancellation: {
      sellerId: string;
      sellerOrderId: string;
      openSubtotalMinor: bigint;
      openCommissionMinor: bigint;
    },
    tx: Transaction,
  ) {
    return this.ledger.add(
      { sellerId: cancellation.sellerId, sellerOrderId: cancellation.sellerOrderId },
      cancellationEntries(cancellation.openSubtotalMinor, cancellation.openCommissionMinor),
      tx,
    );
  }

  async balance(sellerId: string) {
    const { pending, paidOut } = await this.ledger.balances(sellerId);
    return { pendingMinor: Number(pending), paidOutMinor: Number(paidOut) };
  }
}
