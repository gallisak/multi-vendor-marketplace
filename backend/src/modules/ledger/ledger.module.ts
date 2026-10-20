import { Module } from '@nestjs/common';
import { SellersModule } from '../sellers/sellers.module.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';
import { MockPayoutGateway, PAYOUT_GATEWAY } from './payout-gateway.js';
import { PayoutSchedulerService } from './payout-scheduler.service.js';
import { AdminPayoutsController, SellerPayoutsController } from './payouts.controller.js';
import { PayoutsService } from './payouts.service.js';

const payoutGateway = { provide: PAYOUT_GATEWAY, useClass: MockPayoutGateway };

@Module({
  providers: [LedgerService, LedgerRepository],
  exports: [LedgerService, LedgerRepository],
})
export class LedgerCoreModule {}

@Module({
  imports: [LedgerCoreModule, SellersModule],
  controllers: [SellerPayoutsController, AdminPayoutsController],
  providers: [PayoutsService, payoutGateway],
})
export class LedgerModule {}

@Module({
  imports: [LedgerCoreModule],
  providers: [PayoutsService, PayoutSchedulerService, payoutGateway],
})
export class LedgerWorkerModule {}
