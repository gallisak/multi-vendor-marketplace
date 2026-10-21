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
import { Label } from '@/shared/ui/label';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { useCancelOrderPart } from '../api/use-order-part-actions';

const schema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Keep it under 500 characters')
    .refine((value) => value.length === 0 || value.length >= 3, 'At least 3 characters'),
});

export function CancelPartDialog({
  orderId,
  sellerOrderId,
  storeName,
}: {
  orderId: string;
  sellerOrderId: string;
  storeName: string;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelOrderPart();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = form.handleSubmit(({ reason }) =>
    cancel.mutate(
      { orderId, sellerOrderId, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success(`The part from ${storeName} was cancelled and will be refunded`);
          setOpen(false);
          form.reset();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Cancel this part
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Cancel items from {storeName}?</DialogTitle>
            <DialogDescription>
              Only this seller's part is cancelled and refunded. Items from other sellers stay in
              the order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea id="cancel-reason" {...form.register('reason')} />
            {form.formState.errors.reason && (
              <p className="text-sm text-destructive">{form.formState.errors.reason.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={cancel.isPending}>
              {cancel.isPending ? 'Cancelling...' : 'Cancel part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
