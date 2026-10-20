import { Module } from '@nestjs/common';
import { LedgerCoreModule } from '../ledger/ledger.module.js';
import { InventoryRepository } from './inventory.repository.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';
import { OrdersRepository } from './orders.repository.js';

@Module({
  imports: [LedgerCoreModule],
  providers: [OrderLifecycleService, OrdersRepository, InventoryRepository],
  exports: [OrderLifecycleService, OrdersRepository, InventoryRepository, LedgerCoreModule],
})
export class OrdersCoreModule {}
