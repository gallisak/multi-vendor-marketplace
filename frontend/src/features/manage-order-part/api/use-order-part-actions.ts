import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Order } from '@/shared/api';

interface PartRef {
  orderId: string;
  sellerOrderId: string;
}

function useOrderMutation<T extends PartRef>(action: string, body?: (input: T) => unknown) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: T) =>
      api<Order>(`/orders/${input.orderId}/seller-orders/${input.sellerOrderId}/${action}`, {
        method: 'POST',
        body: body?.(input),
      }),
    onSuccess: (order) => {
      queryClient.setQueryData(['orders', 'detail', order.id], order);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'list'] });
    },
  });
}

export const useCancelOrderPart = () =>
  useOrderMutation<PartRef & { reason?: string }>('cancel', ({ reason }) => ({ reason }));

export const useConfirmDelivery = () => useOrderMutation<PartRef>('confirm-delivery');
