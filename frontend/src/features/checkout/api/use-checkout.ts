import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CART_QUERY_KEY } from '@/entities/cart';
import { api, type Order } from '@/shared/api';

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expectedTotalMinor, key }: { expectedTotalMinor: number; key: string }) =>
      api<Order>('/orders/checkout', {
        method: 'POST',
        body: { expectedTotalMinor },
        idempotencyKey: key,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
