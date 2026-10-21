import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type Order, type Page, type SellerOrder, type SellerOrderStatus } from '@/shared/api';

export const useOrders = (page: number) =>
  useQuery({
    queryKey: ['orders', 'list', page],
    queryFn: () => api<Page<Order>>('/orders', { query: { page, limit: 10 } }),
    placeholderData: keepPreviousData,
  });

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => api<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  });

export const useSellerOrders = (status: SellerOrderStatus | undefined, page: number) =>
  useQuery({
    queryKey: ['seller-orders', status, page],
    queryFn: () => api<Page<SellerOrder>>('/seller/orders', { query: { status, page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });

export const useSellerOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['seller-orders', 'detail', id],
    queryFn: () => api<SellerOrder>(`/seller/orders/${id}`),
    enabled: Boolean(id),
  });
