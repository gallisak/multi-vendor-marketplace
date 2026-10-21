import { useQuery } from '@tanstack/react-query';
import { api, type Dispute, type DisputeStatus, type Page } from '@/shared/api';

export const useMyDisputes = () =>
  useQuery({
    queryKey: ['disputes', 'mine'],
    queryFn: () => api<Page<Dispute>>('/disputes', { query: { limit: 100 } }),
  });

export const useSellerDisputes = () =>
  useQuery({
    queryKey: ['disputes', 'seller'],
    queryFn: () => api<Page<Dispute>>('/seller/disputes', { query: { limit: 100 } }),
  });

export const useAdminDisputes = (status: DisputeStatus | undefined) =>
  useQuery({
    queryKey: ['disputes', 'admin', status],
    queryFn: () => api<Page<Dispute>>('/admin/disputes', { query: { status, limit: 100 } }),
  });
