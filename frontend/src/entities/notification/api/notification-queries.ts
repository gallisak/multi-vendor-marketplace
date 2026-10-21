import { useQuery } from '@tanstack/react-query';
import { api, type Notification } from '@/shared/api';

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    enabled,
    refetchInterval: 60_000,
  });
