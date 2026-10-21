import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auctionQueryKey } from '@/entities/auction';
import { api, type BidResult } from '@/shared/api';

export function usePlaceBid(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ amountMinor, key }: { amountMinor: number; key: string }) =>
      api<BidResult>(`/auctions/${productId}/bids`, {
        method: 'POST',
        body: { amountMinor },
        idempotencyKey: key,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auctionQueryKey(productId) }),
  });
}
