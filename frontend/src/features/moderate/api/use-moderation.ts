import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SellerApplication, type SellerProduct } from '@/shared/api';

type Target = 'seller-applications' | 'products';
type Decision = 'approve' | 'reject';

export function useModeration<T extends SellerApplication | SellerProduct>(target: Target) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: Decision; note?: string }) =>
      api<T>(`/admin/${target}/${id}/${decision}`, { method: 'POST', body: { note } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', target === 'products' ? 'products' : 'applications'],
      });
    },
  });
}
