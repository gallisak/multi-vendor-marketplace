import { useQuery } from '@tanstack/react-query';
import { api, type AuctionView } from '@/shared/api';

export const auctionQueryKey = (productId: string | undefined) => ['auction', productId];

export const useAuction = (productId: string | undefined) =>
  useQuery({
    queryKey: auctionQueryKey(productId),
    queryFn: () => api<AuctionView>(`/auctions/${productId}`),
    enabled: Boolean(productId),
  });
