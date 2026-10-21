import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { useCancelSellerOrder } from '../api/use-seller-order-actions';

const schema = z.object({
  reason: z.string().trim().min(3, 'At least 3 characters').max(500, 'At most 500 characters'),
});

export function SellerCancelDialog({ sellerOrderId }: { sellerOrderId: string }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelSellerOrder(sellerOrderId);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = form.handleSubmit(({ reason }) =>
    cancel.mutate(reason, {
      onSuccess: () => {
        toast.success('Order cancelled, the buyer is refunded');
        setOpen(false);
        form.reset();
      },
      onError: (error) => toast.error(errorMessage(error)),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              Items go back to stock, the buyer gets a full refund for your part and the platform
              commission is reversed. Parts from other sellers are not affected.
            </DialogDescription>
          </DialogHeader>
          <FormField
            id="seller-cancel-reason"
            label="Reason for the buyer"
            error={form.formState.errors.reason?.message}
          >
            <Textarea id="seller-cancel-reason" {...form.register('reason')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={cancel.isPending}>
              Cancel order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
