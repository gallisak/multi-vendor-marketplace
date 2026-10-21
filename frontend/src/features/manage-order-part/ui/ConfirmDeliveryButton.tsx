import { PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useConfirmDelivery } from '../api/use-order-part-actions';

export function ConfirmDeliveryButton({
  orderId,
  sellerOrderId,
}: {
  orderId: string;
  sellerOrderId: string;
}) {
  const confirm = useConfirmDelivery();
  return (
    <Button
      size="sm"
      disabled={confirm.isPending}
      onClick={() =>
        confirm.mutate(
          { orderId, sellerOrderId },
          {
            onSuccess: () => toast.success('Delivery confirmed'),
            onError: (error) => toast.error(errorMessage(error)),
          },
        )
      }
    >
      <PackageCheck /> I received it
    </Button>
  );
}
