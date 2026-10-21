import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type ReviewsPage } from '@/shared/api';

export const useReviews = (productId: string | undefined, page: number) =>
  useQuery({
    queryKey: ['product', productId, 'reviews', page],
    queryFn: () =>
      api<ReviewsPage>(`/products/${productId}/reviews`, { query: { page, limit: 5 } }),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  });
