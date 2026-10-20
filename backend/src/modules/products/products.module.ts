import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { SellersModule } from '../sellers/sellers.module.js';
import { CatalogCacheProcessor } from './catalog-cache.processor.js';
import { CatalogCacheService } from './catalog-cache.service.js';
import { CatalogService } from './catalog.service.js';
import { ProductModerationService } from './product-moderation.service.js';
import { ProductsRepository } from './products.repository.js';
import {
  AdminProductsController,
  ProductsController,
  SellerProductsController,
} from './products.controller.js';
import { SellerProductsService } from './seller-products.service.js';

@Module({
  imports: [SellersModule, CategoriesModule],
  controllers: [ProductsController, SellerProductsController, AdminProductsController],
  providers: [
    CatalogService,
    CatalogCacheService,
    SellerProductsService,
    ProductModerationService,
    ProductsRepository,
  ],
  exports: [CatalogService, ProductsRepository],
})
export class ProductsModule {}

@Module({
  providers: [CatalogCacheService, CatalogCacheProcessor],
})
export class CatalogCacheWorkerModule {}
