import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { LedgerCoreModule } from '../ledger/ledger.module.js';
import { CheckoutService } from './checkout.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [CartModule, LedgerCoreModule],
  controllers: [OrdersController],
  providers: [CheckoutService, OrdersService, OrdersRepository, InventoryRepository],
})
export class OrdersModule {}
