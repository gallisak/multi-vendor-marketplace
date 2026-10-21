import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Review } from '@/shared/api';

export function useCreateReview(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; comment?: string }) =>
      api<Review>(`/products/${productId}/reviews`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', productId] }),
  });
}
