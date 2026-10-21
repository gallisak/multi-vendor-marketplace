import { Module } from '@nestjs/common';
import { OrdersCoreModule } from '../orders/orders-core.module.js';
import { MockPaymentGateway, PAYMENT_GATEWAY } from './payment-gateway.js';
import { PaymentsProcessor } from './payments.processor.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentExpiryService } from './payment-expiry.service.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersCoreModule],
  providers: [
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
    PaymentsService,
    PaymentsRepository,
    PaymentsProcessor,
    PaymentExpiryService,
  ],
})
export class PaymentsWorkerModule {}
