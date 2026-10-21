import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type Page, type Product, type ProductStatus, type SearchResult } from '@/shared/api';
import type { CatalogFilters } from '../model/catalog-filters';

export const useSearch = (filters: CatalogFilters) =>
  useQuery({
    queryKey: ['search', filters],
    queryFn: ({ signal }) => api<SearchResult>('/search', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['product', id],
    queryFn: () => api<Product>(`/products/${id}`),
    enabled: Boolean(id),
  });

export const useSimilarProducts = (id: string | undefined) =>
  useQuery({
    queryKey: ['product', id, 'similar'],
    queryFn: () => api<Product[]>(`/products/${id}/similar`, { query: { limit: 4 } }),
    enabled: Boolean(id),
  });

export const useModerationQueue = (status: ProductStatus | undefined) =>
  useQuery({
    queryKey: ['admin', 'products', status],
    queryFn: () => api<Page<Product>>('/admin/products', { query: { status, limit: 100 } }),
  });
