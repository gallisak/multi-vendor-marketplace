import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { ProductsModule } from '../products/products.module.js';
import { MeiliSearchIndex } from './meili-search-index.js';
import { SEARCH_INDEX } from './search-index.port.js';
import { SearchSyncProcessor } from './search-sync.processor.js';
import { SearchSyncRepository } from './search-sync.repository.js';
import { SearchSyncService } from './search-sync.service.js';
import { AdminSearchController, SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

const searchIndexProvider = { provide: SEARCH_INDEX, useClass: MeiliSearchIndex };

@Module({
  imports: [ProductsModule],
  controllers: [SearchController, AdminSearchController],
  providers: [searchIndexProvider, SearchService],
})
export class SearchModule {}

@Module({
  imports: [CategoriesModule],
  providers: [searchIndexProvider, SearchSyncService, SearchSyncProcessor, SearchSyncRepository],
})
export class SearchSyncModule {}
