import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiError, newIdempotencyKey } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useCheckoutAuction } from '../api/use-checkout-auction';

export function CheckoutAuctionButton({ productId }: { productId: string }) {
  const checkout = useCheckoutAuction(productId);
  const navigate = useNavigate();
  const attemptKey = useRef<string | null>(null);

  const checkOut = () => {
    attemptKey.current ??= newIdempotencyKey();
    checkout.mutate(attemptKey.current, {
      onSuccess: (order) => {
        attemptKey.current = null;
        void navigate(`/account/orders/${order.id}`);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status < 500) attemptKey.current = null;
        toast.error(
          error instanceof ApiError && error.status === 404
            ? 'Only the winner can check out this lot'
            : errorMessage(error),
        );
      },
    });
  };

  return (
    <Button size="sm" disabled={checkout.isPending} onClick={checkOut}>
      I won, check out
    </Button>
  );
}
