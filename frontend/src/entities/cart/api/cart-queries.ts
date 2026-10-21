import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Cart } from '@/shared/api';
import { withQuantity } from '../lib/with-quantity';

export const CART_QUERY_KEY = ['cart'];

export const useCart = (enabled: boolean) =>
  useQuery({ queryKey: CART_QUERY_KEY, queryFn: () => api<Cart>('/cart'), enabled });

export function useSetCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      quantity > 0
        ? api<Cart>(`/cart/items/${productId}`, { method: 'PUT', body: { quantity } })
        : api<Cart>(`/cart/items/${productId}`, { method: 'DELETE' }),
    onMutate: async ({ productId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart>(CART_QUERY_KEY);
      if (previous?.sellers.some((g) => g.items.some((line) => line.productId === productId))) {
        queryClient.setQueryData(CART_QUERY_KEY, withQuantity(previous, productId, quantity));
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(CART_QUERY_KEY, context.previous);
    },
    onSuccess: (cart) => queryClient.setQueryData(CART_QUERY_KEY, cart),
  });
}
