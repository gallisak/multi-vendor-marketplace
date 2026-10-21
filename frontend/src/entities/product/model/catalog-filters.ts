import type { ProductType } from '@/shared/api';

export type CatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'rating';

export interface CatalogFilters {
  q?: string;
  categoryId?: string;
  sellerId?: string;
  type?: ProductType;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sort?: CatalogSort;
  page?: number;
  limit?: number;
}
