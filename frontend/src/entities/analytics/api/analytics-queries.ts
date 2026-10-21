import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type AnalyticsSummary, type SalesChart } from '@/shared/api';

export interface Period {
  from?: string;
  to?: string;
}

export const useAnalyticsSummary = (period: Period) =>
  useQuery({
    queryKey: ['admin', 'summary', period],
    queryFn: () => api<AnalyticsSummary>('/admin/analytics/summary', { query: { ...period } }),
    placeholderData: keepPreviousData,
  });

export const useSalesChart = () =>
  useQuery({
    queryKey: ['admin', 'sales-chart'],
    queryFn: () => api<SalesChart>('/admin/analytics/sales-chart', { query: { days: 30 } }),
  });
