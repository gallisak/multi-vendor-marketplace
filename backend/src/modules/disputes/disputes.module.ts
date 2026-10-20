import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { SellersModule } from '../sellers/sellers.module.js';
import { AdminDisputesController, DisputesController } from './disputes.controller.js';
import { DisputesRepository } from './disputes.repository.js';
import { DisputesService } from './disputes.service.js';

@Module({
  imports: [OrdersModule, SellersModule],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService, DisputesRepository],
})
export class DisputesModule {}
