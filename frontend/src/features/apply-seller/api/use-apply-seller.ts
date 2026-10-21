import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SellerApplication } from '@/shared/api';

export function useApplySeller() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeName: string; description?: string }) =>
      api<SellerApplication>('/seller-applications', { method: 'POST', body }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['seller-applications', 'mine'] }),
  });
}
