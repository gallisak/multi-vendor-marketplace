import type { CatalogFilters } from '@/entities/product';
import { toMinor } from '@/shared/lib';

const SORTS = ['newest', 'price_asc', 'price_desc', 'rating'] as const;

export function filtersFromParams(params: URLSearchParams): CatalogFilters {
  const number = (name: string) => {
    const value = params.get(name);
    return value === null || value === '' || Number.isNaN(Number(value))
      ? undefined
      : Number(value);
  };
  const sort = params.get('sort');
  const type = params.get('type');
  const inStock = params.get('inStock');
  const minPrice = number('minPrice');
  const maxPrice = number('maxPrice');
  return {
    q: params.get('q') || undefined,
    categoryId: params.get('categoryId') || undefined,
    sellerId: params.get('sellerId') || undefined,
    type: type === 'FIXED_PRICE' || type === 'AUCTION' ? type : undefined,
    minPrice: minPrice === undefined ? undefined : toMinor(minPrice),
    maxPrice: maxPrice === undefined ? undefined : toMinor(maxPrice),
    minRating: number('minRating'),
    inStock: inStock === 'true' ? true : undefined,
    sort: SORTS.find((value) => value === sort) ?? 'newest',
    page: number('page') ?? 1,
    limit: 24,
  };
}

export function withParam(params: URLSearchParams, name: string, value: string | undefined) {
  const next = new URLSearchParams(params);
  if (value === undefined || value === '') {
    next.delete(name);
  } else {
    next.set(name, value);
  }
  if (name !== 'page') {
    next.delete('page');
  }
  return next;
}
