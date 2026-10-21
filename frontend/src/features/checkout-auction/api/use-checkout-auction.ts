import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auctionQueryKey } from '@/entities/auction';
import { api, newIdempotencyKey, type Order } from '@/shared/api';

export function useCheckoutAuction(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Order>(`/auctions/${productId}/checkout`, {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: auctionQueryKey(productId) });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
