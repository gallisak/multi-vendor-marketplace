import { Module } from '@nestjs/common';
import { SellersModule } from '../sellers/sellers.module.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';
import { MockPayoutGateway, PAYOUT_GATEWAY } from './payout-gateway.js';
import { PayoutSchedulerService } from './payout-scheduler.service.js';
import { PayoutTransferService } from './payout-transfer.service.js';
import { AdminPayoutsController, SellerPayoutsController } from './payouts.controller.js';
import { PayoutsProcessor } from './payouts.processor.js';
import { PayoutsService } from './payouts.service.js';

@Module({
  providers: [LedgerService, LedgerRepository],
  exports: [LedgerService, LedgerRepository],
})
export class LedgerCoreModule {}

@Module({
  imports: [LedgerCoreModule, SellersModule],
  controllers: [SellerPayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
})
export class LedgerModule {}

@Module({
  imports: [LedgerCoreModule],
  providers: [
    PayoutsService,
    PayoutSchedulerService,
    PayoutTransferService,
    PayoutsProcessor,
    { provide: PAYOUT_GATEWAY, useClass: MockPayoutGateway },
  ],
})
export class LedgerWorkerModule {}
