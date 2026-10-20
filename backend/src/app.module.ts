import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { ThrottlingModule } from './infra/throttling/throttling.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuctionsModule } from './modules/auctions/auctions.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { DisputesModule } from './modules/disputes/disputes.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { SellersModule } from './modules/sellers/sellers.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    CoreModule,
    HealthModule,
    ThrottlingModule,
    UsersModule,
    AuthModule,
    SellersModule,
    CategoriesModule,
    ProductsModule,
    SearchModule,
    NotificationsModule,
    CartModule,
    LedgerModule,
    OrdersModule,
    AuctionsModule,
    RealtimeModule,
    ReviewsModule,
    DisputesModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
