import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import {
  paymentCaptured,
  paymentFailed,
  sellerOrderPaid,
} from '../../common/events/domain-events.js';
import { PaymentStatus } from '../../generated/prisma/enums.js';
import { IdempotentConsumerService } from '../../infra/outbox/idempotent-consumer.service.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PAYMENT_FAILED_REASON } from '../notifications/notification-rules.js';
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

    await this.idempotent.runOnce('payments', eventId, async (tx) => {
      await this.lifecycle.lockOrder(tx, orderId);
      if (!(await this.payments.settlePending(orderId, result, tx))) {
        return;
      }

      const order = await this.payments.setOrderPaymentStatus(
        orderId,
        result.ok ? PaymentStatus.CAPTURED : PaymentStatus.FAILED,
        tx,
      );

      if (result.ok) {
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
        for (const sellerOrder of order.sellerOrders) {
          await this.lifecycle.cancel(tx, sellerOrder.id, PAYMENT_FAILED_REASON);
        }
        await this.outbox.add(
          tx,
          paymentFailed({ orderId, buyerId: order.buyerId, reason: result.reason }),
        );
      }

      this.attempts.inc({ status: result.ok ? 'captured' : 'failed' });
      this.logger.log(
        { orderId, status: result.ok ? 'captured' : 'failed' },
        result.ok ? 'Payment captured' : 'Payment failed, order compensated',
      );
    });
  }
}
