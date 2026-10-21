import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Notification } from '@/shared/api';

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    enabled,
    refetchInterval: 60_000,
  });

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ updated: number }>('/notifications/read', { method: 'POST' }),
    onSuccess: ({ updated }) => {
      if (updated > 0) void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
