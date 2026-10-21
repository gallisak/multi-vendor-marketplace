import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  api,
  type ApplicationStatus,
  type Page,
  type Payout,
  type ProductStatus,
  type SellerApplication,
  type SellerDashboard,
  type SellerPayouts,
  type SellerProduct,
} from '@/shared/api';

export const useSellerDashboard = () =>
  useQuery({
    queryKey: ['seller-dashboard'],
    queryFn: () => api<SellerDashboard>('/seller/dashboard'),
  });

export const useSellerProducts = (status: ProductStatus | undefined, page: number) =>
  useQuery({
    queryKey: ['seller-products', status, page],
    queryFn: () =>
      api<Page<SellerProduct>>('/seller/products', { query: { status, page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });

export const useSellerProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['seller-products', 'detail', id],
    queryFn: () => api<SellerProduct>(`/seller/products/${id}`),
    enabled: Boolean(id),
  });

export const useSellerPayouts = (page: number) =>
  useQuery({
    queryKey: ['seller-payouts', page],
    queryFn: () => api<SellerPayouts>('/seller/payouts', { query: { page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });

export const useAdminPayouts = (page: number) =>
  useQuery({
    queryKey: ['admin', 'payouts', page],
    queryFn: () => api<Page<Payout>>('/admin/payouts', { query: { page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });

export const useMyApplications = (enabled = true) =>
  useQuery({
    queryKey: ['seller-applications', 'mine'],
    queryFn: () => api<SellerApplication[]>('/seller-applications/me'),
    enabled,
  });

export const useApplications = (status: ApplicationStatus | undefined) =>
  useQuery({
    queryKey: ['admin', 'applications', status],
    queryFn: () =>
      api<Page<SellerApplication>>('/admin/seller-applications', { query: { status, limit: 100 } }),
  });
