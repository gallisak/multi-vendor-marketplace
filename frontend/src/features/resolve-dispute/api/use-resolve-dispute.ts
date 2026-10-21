import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Dispute } from '@/shared/api';

export type DisputeDecision = 'BUYER' | 'SELLER';

export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: DisputeDecision; note: string }) =>
      api<Dispute>(`/admin/disputes/${id}/resolve`, { method: 'POST', body: { decision, note } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disputes'] });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
