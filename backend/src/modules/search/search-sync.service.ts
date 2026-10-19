import { Inject, Injectable, Logger } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service.js';
import { isSearchable, SEARCHABLE_STATUSES, toSearchDocument } from './search-document.js';
import { SEARCH_INDEX, type SearchIndex } from './search-index.port.js';
import { SearchSyncRepository } from './search-sync.repository.js';

const REINDEX_BATCH = 500;

@Injectable()
export class SearchSyncService {
  private readonly logger = new Logger(SearchSyncService.name);

  constructor(
    private readonly products: SearchSyncRepository,
    private readonly categories: CategoriesService,
    @Inject(SEARCH_INDEX) private readonly index: SearchIndex,
  ) {}

  async syncProducts(productIds: string[]) {
    if (productIds.length === 0) return;
    const products = await this.products.findForIndexing(productIds);
    const categories = await this.categoriesCovering(products.map((p) => p.categoryId));

    const searchable = products.filter((p) => isSearchable(p, p.seller.isActive));
    const searchableIds = new Set(searchable.map((p) => p.id));

    await this.index.upsert(searchable.map((product) => toSearchDocument(product, categories)));
    await this.index.remove(productIds.filter((id) => !searchableIds.has(id)));
  }

  async syncCategory(categoryId: string) {
    this.categories.invalidate();
    const categoryIds = await this.categories.withDescendants(categoryId);
    await this.syncProducts(
      await this.products.findIdsInCategories(categoryIds, SEARCHABLE_STATUSES),
    );
  }

  private async categoriesCovering(categoryIds: string[]) {
    const cached = await this.categories.all();
    const known = new Set(cached.map((category) => category.id));
    if (categoryIds.every((id) => known.has(id))) {
      return cached;
    }
    this.categories.invalidate();
    return this.categories.all();
  }

  async reindexAll() {
    await this.index.ensureReady();
    let cursor: string | undefined;
    let total = 0;
    const productIds = new Set<string>();
    for (;;) {
      const batch = await this.products.findIdsAfter(cursor, REINDEX_BATCH);
      if (batch.length === 0) break;
      await this.syncProducts(batch);
      batch.forEach((id) => productIds.add(id));
      total += batch.length;
      cursor = batch[batch.length - 1];
    }
    const orphans = (await this.index.allIds()).filter((id) => !productIds.has(id));
    await this.index.remove(orphans);
    this.logger.log({ products: total, orphansRemoved: orphans.length }, 'Search index rebuilt');
    return total;
  }

  async bootstrap() {
    await this.index.ensureReady();
    const [indexed, searchable] = await Promise.all([
      this.index.count(),
      this.products.countWithStatus(SEARCHABLE_STATUSES),
    ]);
    if (indexed === 0 && searchable > 0) {
      this.logger.log({ searchable }, 'Search index is empty, rebuilding');
      await this.reindexAll();
    }
  }
}
