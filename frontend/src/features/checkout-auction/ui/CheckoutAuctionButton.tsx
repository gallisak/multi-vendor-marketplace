import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useCheckoutAuction } from '../api/use-checkout-auction';

export function CheckoutAuctionButton({ productId }: { productId: string }) {
  const checkout = useCheckoutAuction(productId);
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      disabled={checkout.isPending}
      onClick={() =>
        checkout.mutate(undefined, {
          onSuccess: (order) => navigate(`/account/orders/${order.id}`),
          onError: (error) =>
            toast.error(
              error instanceof ApiError && error.status === 404
                ? 'Only the winner can check out this lot'
                : errorMessage(error),
            ),
        })
      }
    >
      I won, check out
    </Button>
  );
}
