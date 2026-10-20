import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export type ChargeOutcome = { ok: true; providerRef: string } | { ok: false; reason: string };

@Injectable()
export class PaymentsRepository extends PrismaRepository {
  findByOrder(orderId: string) {
    return this.prisma.payment.findUnique({ where: { orderId } });
  }

  async settlePending(orderId: string, outcome: ChargeOutcome, tx: Transaction) {
    const { count } = await tx.payment.updateMany({
      where: { orderId, status: PaymentStatus.PENDING },
      data: outcome.ok
        ? { status: PaymentStatus.CAPTURED, providerRef: outcome.providerRef }
        : { status: PaymentStatus.FAILED, failReason: outcome.reason },
    });
    return count === 1;
  }

  setOrderPaymentStatus(orderId: string, paymentStatus: PaymentStatus, tx: Transaction) {
    return tx.order.update({
      where: { id: orderId },
      data: { paymentStatus, version: { increment: 1 } },
      include: { sellerOrders: { include: { seller: { select: { userId: true } } } } },
    });
  }
}
