import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Dispute } from '@/shared/api';

export function useOpenDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      sellerOrderId,
      reason,
    }: {
      orderId: string;
      sellerOrderId: string;
      reason: string;
    }) =>
      api<Dispute>(`/orders/${orderId}/seller-orders/${sellerOrderId}/disputes`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disputes'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useWithdrawDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Dispute>(`/disputes/${id}/withdraw`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disputes'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
