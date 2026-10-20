import { Module } from '@nestjs/common';
import { LedgerCoreModule } from '../ledger/ledger.module.js';
import { SellersModule } from '../sellers/sellers.module.js';
import { AdminAnalyticsController, SellerDashboardController } from './analytics.controller.js';
import { AnalyticsProcessor } from './analytics.processor.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { AnalyticsService } from './analytics.service.js';
import { SalesDailyRepository } from './sales-daily.repository.js';
import { SalesProjectionService } from './sales-projection.service.js';
import { SellerDashboardService } from './seller-dashboard.service.js';

@Module({
  imports: [SellersModule, LedgerCoreModule],
  controllers: [AdminAnalyticsController, SellerDashboardController],
  providers: [AnalyticsService, AnalyticsRepository, SellerDashboardService],
})
export class AnalyticsModule {}

@Module({
  providers: [SalesProjectionService, SalesDailyRepository, AnalyticsProcessor],
})
export class AnalyticsWorkerModule {}
