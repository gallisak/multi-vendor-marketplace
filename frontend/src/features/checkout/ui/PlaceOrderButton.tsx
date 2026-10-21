import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiError, type Cart, newIdempotencyKey } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useCheckout } from '../api/use-checkout';

export function PlaceOrderButton({
  cart,
  disabled,
  onRejected,
}: {
  cart: Cart;
  disabled?: boolean;
  onRejected?: () => void;
}) {
  const checkout = useCheckout();
  const navigate = useNavigate();
  const attempt = useRef<{ total: number; key: string } | null>(null);

  const placeOrder = () => {
    if (attempt.current?.total !== cart.totalMinor) {
      attempt.current = { total: cart.totalMinor, key: newIdempotencyKey() };
    }
    checkout.mutate(
      { expectedTotalMinor: cart.totalMinor, key: attempt.current.key },
      {
        onSuccess: (order) => {
          attempt.current = null;
          toast.success('Order placed, payment is being processed');
          void navigate(`/account/orders/${order.id}`);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status < 500) {
            attempt.current = null;
            onRejected?.();
          }
          toast.error(errorMessage(error));
        },
      },
    );
  };

  return (
    <Button
      className="w-full"
      disabled={disabled || cart.hasUnavailableItems || checkout.isPending}
      onClick={placeOrder}
    >
      {checkout.isPending ? 'Placing order...' : 'Place order'}
    </Button>
  );
}
