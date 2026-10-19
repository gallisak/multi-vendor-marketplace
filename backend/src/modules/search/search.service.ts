import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { CircuitBreaker } from '../../common/circuit-breaker.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { CatalogService } from '../products/catalog.service.js';
import type { ProductDto } from '../products/products.dto.js';
import { SEARCH_INDEX, type ProductSearchDocument, type SearchIndex } from './search-index.port.js';
import type { SearchHitDto, SearchQueryDto, SearchResultDto } from './search.dto.js';

const EMPTY_FACETS = { categoryIds: {}, sellerId: {}, type: {}, inStock: {} };

const fromDocument = (doc: ProductSearchDocument): SearchHitDto => ({
  id: doc.id,
  title: doc.title,
  type: doc.type,
  priceMinor: doc.priceMinor,
  stock: doc.stock,
  inStock: doc.inStock,
  imageUrl: doc.imageUrl,
  ratingAvg: doc.ratingAvg,
  ratingCount: doc.ratingCount,
  categoryId: doc.categoryId,
  categoryName: doc.categoryName,
  sellerId: doc.sellerId,
  sellerName: doc.sellerName,
  auctionEndsAt: doc.auctionEndsAt,
});

const fromCatalog = (product: ProductDto): SearchHitDto => ({
  id: product.id,
  title: product.title,
  type: product.type,
  priceMinor: product.priceMinor,
  stock: product.stock,
  inStock: product.stock > 0,
  imageUrl: product.imageUrls[0] ?? null,
  ratingAvg: product.ratingAvg,
  ratingCount: product.ratingCount,
  categoryId: product.category.id,
  categoryName: product.category.name,
  sellerId: product.seller.id,
  sellerName: product.seller.storeName,
  auctionEndsAt: product.auction?.endsAt.getTime() ?? null,
});

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  readonly breaker = new CircuitBreaker(3, 10_000);

  constructor(
    @Inject(SEARCH_INDEX) private readonly index: SearchIndex,
    private readonly catalog: CatalogService,
    @InjectMetric(METRIC.searchFallbacks) private readonly fallbacks: Counter<string>,
  ) {}

  async search(query: SearchQueryDto): Promise<SearchResultDto> {
    if (!this.breaker.tryAcquire()) {
      return this.fallback(query, 'circuit_open');
    }

    try {
      const result = await this.index.search(query);
      this.breaker.recordSuccess();
      return {
        items: result.hits.map(fromDocument),
        total: result.total,
        page: query.page,
        limit: query.limit,
        facets: result.facets,
        priceRange: result.priceRange,
        source: 'search',
        degraded: false,
      };
    } catch (error) {
      this.breaker.recordFailure();
      this.logger.warn(
        { err: error, breaker: this.breaker.state },
        'Search engine unavailable, falling back to database',
      );
      return this.fallback(query, 'error');
    }
  }

  private async fallback(query: SearchQueryDto, reason: string): Promise<SearchResultDto> {
    this.fallbacks.inc({ reason });
    const page = await this.catalog.list(query);
    return {
      items: page.items.map(fromCatalog),
      total: page.total,
      page: page.page,
      limit: page.limit,
      facets: EMPTY_FACETS,
      priceRange: null,
      source: 'database',
      degraded: true,
    };
  }
}
