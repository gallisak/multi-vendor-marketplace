import { Module } from '@nestjs/common';
import { AuctionRelistService } from '../auctions/auction-relist.service.js';
import { AuctionsRepository } from '../auctions/auctions.repository.js';
import { LedgerCoreModule } from '../ledger/ledger.module.js';
import { InventoryRepository } from './inventory.repository.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';
import { OrdersRepository } from './orders.repository.js';

@Module({
  imports: [LedgerCoreModule],
  providers: [
    OrderLifecycleService,
    OrdersRepository,
    InventoryRepository,
    AuctionsRepository,
    AuctionRelistService,
  ],
  exports: [
    OrderLifecycleService,
    OrdersRepository,
    InventoryRepository,
    AuctionsRepository,
    AuctionRelistService,
    LedgerCoreModule,
  ],
})
export class OrdersCoreModule {}
