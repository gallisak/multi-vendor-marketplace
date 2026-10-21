import { PackageCheck, Truck } from 'lucide-react';
import { toast } from 'sonner';
import type { SellerOrder } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useAcceptSellerOrder, useShipSellerOrder } from '../api/use-seller-order-actions';
import { canAccept, canShip } from '../lib/seller-order-rules';

export function SellerOrderActions({ order }: { order: SellerOrder }) {
  const accept = useAcceptSellerOrder(order.id);
  const ship = useShipSellerOrder(order.id);
  const onError = (error: unknown) => toast.error(errorMessage(error));

  return (
    <>
      {canAccept(order) && (
        <Button
          size="sm"
          disabled={accept.isPending}
          onClick={() =>
            accept.mutate(undefined, { onSuccess: () => toast.success('Order accepted'), onError })
          }
        >
          <PackageCheck /> Accept
        </Button>
      )}
      {canShip(order) && (
        <Button
          size="sm"
          disabled={ship.isPending}
          onClick={() =>
            ship.mutate(undefined, { onSuccess: () => toast.success('Marked as shipped'), onError })
          }
        >
          <Truck /> Mark as shipped
        </Button>
      )}
    </>
  );
}
