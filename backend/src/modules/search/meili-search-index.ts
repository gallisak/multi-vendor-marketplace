import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Meilisearch, type Index } from 'meilisearch';
import type { Env } from '../../infra/config/env.schema.js';
import type { CatalogSort } from '../products/products.dto.js';
import type {
  FacetCounts,
  ProductSearchDocument,
  SearchIndex,
  SearchRequest,
  SearchResponse,
} from './search-index.port.js';

const TASK_TIMEOUT_MS = 10_000;
const ID_PAGE_SIZE = 1000;

const SORT: Record<CatalogSort, string[]> = {
  newest: ['createdAt:desc'],
  price_asc: ['priceMinor:asc'],
  price_desc: ['priceMinor:desc'],
  rating: ['ratingAvg:desc', 'ratingCount:desc'],
};

const FACETS = ['categoryIds', 'sellerId', 'type', 'inStock'] as const;

export function buildFilter(request: SearchRequest): string[] {
  const filter: string[] = [];
  const quote = (value: string) => `"${value.replace(/["\\]/g, '')}"`;

  if (request.categoryId) filter.push(`categoryIds = ${quote(request.categoryId)}`);
  if (request.sellerId) filter.push(`sellerId = ${quote(request.sellerId)}`);
  if (request.type) filter.push(`type = ${quote(request.type)}`);
  if (request.minPrice !== undefined) filter.push(`priceMinor >= ${Number(request.minPrice)}`);
  if (request.maxPrice !== undefined) filter.push(`priceMinor <= ${Number(request.maxPrice)}`);
  if (request.minRating !== undefined) filter.push(`ratingAvg >= ${Number(request.minRating)}`);
  if (request.inStock !== undefined) filter.push(`inStock = ${request.inStock}`);
  return filter;
}

@Injectable()
export class MeiliSearchIndex implements SearchIndex {
  private readonly index: Index<ProductSearchDocument>;
  private readonly client: Meilisearch;
  private readonly indexUid: string;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Meilisearch({
      host: config.get('MEILI_HOST', { infer: true }),
      apiKey: config.get('MEILI_MASTER_KEY', { infer: true }),
      timeout: config.get('SEARCH_TIMEOUT_MS', { infer: true }),
    });
    this.indexUid = `${config.get('MEILI_INDEX_PREFIX', { infer: true })}products`;
    this.index = this.client.index<ProductSearchDocument>(this.indexUid);
  }

  async ensureReady() {
    await this.client
      .createIndex(this.indexUid, { primaryKey: 'id' })
      .waitTask({ timeout: TASK_TIMEOUT_MS });
    await this.index
      .updateSettings({
        searchableAttributes: ['title', 'categoryName', 'sellerName', 'description'],
        filterableAttributes: [
          'categoryIds',
          'sellerId',
          'type',
          'inStock',
          'priceMinor',
          'ratingAvg',
        ],
        sortableAttributes: ['createdAt', 'priceMinor', 'ratingAvg', 'ratingCount'],
        faceting: { maxValuesPerFacet: 100 },
      })
      .waitTask({ timeout: TASK_TIMEOUT_MS });
  }

  async upsert(documents: ProductSearchDocument[]) {
    if (documents.length === 0) return;
    const task = await this.index
      .addDocuments(documents, { primaryKey: 'id' })
      .waitTask({ timeout: TASK_TIMEOUT_MS });
    if (task.status === 'failed') {
      throw new Error(`Search upsert failed: ${task.error?.message ?? 'unknown error'}`);
    }
  }

  async remove(ids: string[]) {
    if (ids.length === 0) return;
    const task = await this.index.deleteDocuments(ids).waitTask({ timeout: TASK_TIMEOUT_MS });
    if (task.status === 'failed') {
      throw new Error(`Search removal failed: ${task.error?.message ?? 'unknown error'}`);
    }
  }

  async count() {
    return (await this.index.getStats()).numberOfDocuments;
  }

  async allIds() {
    const ids: string[] = [];
    for (let offset = 0; ; offset += ID_PAGE_SIZE) {
      const page = await this.index.getDocuments<Pick<ProductSearchDocument, 'id'>>({
        fields: ['id'],
        limit: ID_PAGE_SIZE,
        offset,
      });
      ids.push(...page.results.map((doc) => doc.id));
      if (page.results.length < ID_PAGE_SIZE) {
        return ids;
      }
    }
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const result = await this.index.search(request.q ?? '', {
      filter: buildFilter(request),
      sort: SORT[request.sort],
      facets: [...FACETS, 'priceMinor'],
      page: request.page,
      hitsPerPage: request.limit,
    });

    const distribution = result.facetDistribution ?? {};
    const facet = (name: string): FacetCounts => distribution[name] ?? {};
    const price = result.facetStats?.priceMinor;

    return {
      hits: result.hits,
      total: result.totalHits,
      facets: {
        categoryIds: facet('categoryIds'),
        sellerId: facet('sellerId'),
        type: facet('type'),
        inStock: facet('inStock'),
      },
      priceRange: price ? { min: price.min, max: price.max } : null,
    };
  }
}
