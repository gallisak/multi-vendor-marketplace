import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SellerOrder } from '@/shared/api';

export interface RefundInput {
  orderItemId: string;
  quantity: number;
  reason?: string;
  restock?: boolean;
  key: string;
}

function useSellerOrderMutation<T>(mutationFn: (input: T) => Promise<SellerOrder>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (sellerOrder) => {
      queryClient.setQueryData(['seller-orders', 'detail', sellerOrder.id], sellerOrder);
      void queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
    },
  });
}

const post = (id: string, action: string, body?: unknown, idempotencyKey?: string) =>
  api<SellerOrder>(`/seller/orders/${id}/${action}`, { method: 'POST', body, idempotencyKey });

export const useAcceptSellerOrder = (id: string) =>
  useSellerOrderMutation(() => post(id, 'accept'));

export const useShipSellerOrder = (id: string) => useSellerOrderMutation(() => post(id, 'ship'));

export const useCancelSellerOrder = (id: string) =>
  useSellerOrderMutation((reason: string) => post(id, 'cancel', { reason }));

export const useRefundItem = (id: string) =>
  useSellerOrderMutation(({ key, ...body }: RefundInput) => post(id, 'refunds', body, key));
