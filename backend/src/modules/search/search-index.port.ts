import type { CatalogSort } from '../products/products.dto.js';

export const SEARCH_INDEX = Symbol('SEARCH_INDEX');

export interface ProductSearchDocument {
  id: string;
  title: string;
  description: string;
  type: string;
  priceMinor: number;
  currentBidMinor: number | null;
  stock: number;
  inStock: boolean;
  imageUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  categoryId: string;
  categoryName: string;
  categoryIds: string[];
  sellerId: string;
  sellerName: string;
  auctionEndsAt: number | null;
  createdAt: number;
}

export interface SearchFilters {
  q?: string;
  categoryId?: string;
  sellerId?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
}

export interface SearchRequest extends SearchFilters {
  sort: CatalogSort;
  page: number;
  limit: number;
}

export type FacetCounts = Record<string, number>;

export interface SearchResponse {
  hits: ProductSearchDocument[];
  total: number;
  facets: {
    categoryIds: FacetCounts;
    sellerId: FacetCounts;
    type: FacetCounts;
    inStock: FacetCounts;
  };
  priceRange: { min: number; max: number } | null;
}

export interface SearchIndex {
  ensureReady(): Promise<void>;
  upsert(documents: ProductSearchDocument[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(request: SearchRequest): Promise<SearchResponse>;
  count(): Promise<number>;
  allIds(): Promise<string[]>;
}
