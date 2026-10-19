import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminSellerApplicationsController } from './admin-seller-applications.controller.js';
import { SellerApplicationsRepository } from './seller-applications.repository.js';
import { SellerApplicationsService } from './seller-applications.service.js';
import { SellersController } from './sellers.controller.js';
import { SellersRepository } from './sellers.repository.js';
import { SellersService } from './sellers.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SellersController, AdminSellerApplicationsController],
  providers: [
    SellersService,
    SellersRepository,
    SellerApplicationsService,
    SellerApplicationsRepository,
  ],
  exports: [SellersService, SellersRepository],
})
export class SellersModule {}
