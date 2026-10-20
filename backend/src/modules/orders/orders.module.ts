import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { SellersModule } from '../sellers/sellers.module.js';
import { CheckoutService } from './checkout.service.js';
import { OrdersCoreModule } from './orders-core.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { RefundsService } from './refunds.service.js';
import { SellerOrdersController } from './seller-orders.controller.js';
import { SellerOrdersService } from './seller-orders.service.js';

@Module({
  imports: [OrdersCoreModule, SellersModule, CartModule],
  controllers: [OrdersController, SellerOrdersController],
  providers: [CheckoutService, OrdersService, SellerOrdersService, RefundsService],
  exports: [CheckoutService, RefundsService, OrdersCoreModule],
})
export class OrdersModule {}
