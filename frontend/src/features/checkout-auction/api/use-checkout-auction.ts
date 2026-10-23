import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auctionQueryKey } from '@/entities/auction';
import { api, type Order } from '@/shared/api';

export function useCheckoutAuction(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<Order>(`/auctions/${productId}/checkout`, { method: 'POST', idempotencyKey: key }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: auctionQueryKey(productId) });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
