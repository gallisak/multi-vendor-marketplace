import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import {
  type DomainEventPayloads,
  paymentCaptured,
  paymentFailed,
  sellerOrderPaid,
} from '../../common/events/domain-events.js';
import { PaymentStatus } from '../../generated/prisma/enums.js';
import { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PAYMENT_FAILED_REASON } from '../notifications/notification-rules.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';

export const PAYMENT_TIMEOUT_REASON = 'Payment was not confirmed in time';
import { OrderLifecycleService } from '../orders/order-lifecycle.service.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway.js';
import { PaymentsRepository } from './payments.repository.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly outbox: OutboxService,
    private readonly idempotent: IdempotentConsumerService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly uow: UnitOfWork,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @InjectMetric(METRIC.payments) private readonly attempts: Counter<string>,
  ) {}

  async settle(eventId: string, orderId: string) {
    const payment = await this.payments.findByOrder(orderId);
    if (!payment || payment.status !== PaymentStatus.PENDING) {
      return;
    }

    const result = await this.gateway.charge({
      idempotencyKey: orderId,
      amountMinor: payment.amountMinor,
    });

    let settled = false;
    await this.idempotent.runOnce('payments', eventId, async (tx) => {
      await this.lifecycle.lockOrder(tx, orderId);
      if (!(await this.payments.settlePending(orderId, result, tx))) {
        return;
      }
      settled = true;

      if (result.ok) {
        const order = await this.payments.setOrderPaymentStatus(
          orderId,
          PaymentStatus.CAPTURED,
          tx,
        );
        await this.outbox.add(
          tx,
          paymentCaptured({
            orderId,
            buyerId: order.buyerId,
            amountMinor: payment.amountMinor.toString(),
          }),
          ...order.sellerOrders.map((sellerOrder) =>
            sellerOrderPaid({
              sellerOrderId: sellerOrder.id,
              orderId,
              sellerId: sellerOrder.sellerId,
              sellerUserId: sellerOrder.seller.userId,
              subtotalMinor: sellerOrder.subtotalMinor.toString(),
            }),
          ),
        );
      } else {
        await this.compensate(tx, orderId, result.reason);
      }

      this.attempts.inc({ status: result.ok ? 'captured' : 'failed' });
      this.logger.log(
        { orderId, status: result.ok ? 'captured' : 'failed' },
        result.ok ? 'Payment captured' : 'Payment failed, order compensated',
      );
    });

    if (result.ok && !settled && (await this.expiredBeforeCharge(orderId))) {
      await this.voidLateCharge(orderId, payment.amountMinor, result.providerRef);
    }
  }

  async expireStale(cutoff: Date, limit = 100) {
    const orderIds = await this.payments.findStalePending(cutoff, limit);
    let expired = 0;
    for (const orderId of orderIds) {
      const failed = await this.uow.run(async (tx) => {
        await this.lifecycle.lockOrder(tx, orderId);
        const outcome = { ok: false as const, reason: PAYMENT_TIMEOUT_REASON };
        if (!(await this.payments.settlePending(orderId, outcome, tx))) {
          return false;
        }
        await this.compensate(tx, orderId, PAYMENT_TIMEOUT_REASON);
        return true;
      });
      if (failed) {
        expired += 1;
        this.attempts.inc({ status: 'expired' });
        this.logger.warn({ orderId }, 'Payment timed out, order compensated');
      }
    }
    return expired;
  }

  private async compensate(tx: Transaction, orderId: string, reason: string) {
    const order = await this.payments.setOrderPaymentStatus(orderId, PaymentStatus.FAILED, tx);
    for (const sellerOrder of order.sellerOrders) {
      await this.lifecycle.cancel(tx, sellerOrder.id, PAYMENT_FAILED_REASON);
    }
    await this.outbox.add(tx, paymentFailed({ orderId, buyerId: order.buyerId, reason }));
  }

  private async expiredBeforeCharge(orderId: string) {
    const current = await this.payments.findByOrder(orderId);
    return current?.status === PaymentStatus.FAILED;
  }

  private async voidLateCharge(orderId: string, amountMinor: bigint, providerRef: string) {
    const voided = await this.gateway.refund({
      idempotencyKey: `void_${orderId}`,
      providerRef,
      amountMinor,
    });
    if (!voided.ok) {
      throw new Error(`Provider refused to void late charge for ${orderId}: ${voided.reason}`);
    }
    this.attempts.inc({ status: 'voided' });
    this.logger.warn({ orderId, providerRef }, 'Charge arrived after the order expired, voided');
  }

  async refund(eventId: string, request: DomainEventPayloads['payment.refund_requested']) {
    const payment = await this.payments.findByOrder(request.orderId);
    const idempotencyKey = request.refundId ?? `cancel_${request.sellerOrderId}`;
    const result = await this.gateway.refund({
      idempotencyKey,
      providerRef: payment?.providerRef ?? null,
      amountMinor: BigInt(request.amountMinor),
    });
    if (!result.ok) {
      throw new Error(`Provider refused refund ${idempotencyKey}: ${result.reason}`);
    }

    const applied = await this.idempotent.runOnce('payments', eventId, () => Promise.resolve());
    if (applied) {
      this.attempts.inc({ status: 'refunded' });
      this.logger.log(
        {
          orderId: request.orderId,
          amountMinor: request.amountMinor,
          providerRef: result.providerRef,
        },
        'Refund sent to the payment provider',
      );
    }
  }
}
