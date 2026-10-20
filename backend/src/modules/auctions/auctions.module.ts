import { Module } from '@nestjs/common';
import { OrdersCoreModule } from '../orders/orders-core.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AuctionSweeperService } from './auction-sweeper.service.js';
import { AuctionsController } from './auctions.controller.js';
import { AuctionsService } from './auctions.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [AuctionsController],
  providers: [AuctionsService],
})
export class AuctionsModule {}

@Module({
  imports: [OrdersCoreModule],
  providers: [AuctionSweeperService],
  exports: [AuctionSweeperService],
})
export class AuctionsWorkerModule {}
