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
import { useOpenDispute } from '../api/use-dispute-actions';

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Describe the problem in at least 10 characters')
    .max(2000, 'Keep it under 2000 characters'),
});

export function OpenDisputeDialog({
  orderId,
  sellerOrderId,
  storeName,
}: {
  orderId: string;
  sellerOrderId: string;
  storeName: string;
}) {
  const [open, setOpen] = useState(false);
  const openDispute = useOpenDispute();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = form.handleSubmit(({ reason }) =>
    openDispute.mutate(
      { orderId, sellerOrderId, reason },
      {
        onSuccess: () => {
          toast.success('Dispute opened, an admin will review it');
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
          Open a dispute
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Dispute with {storeName}</DialogTitle>
            <DialogDescription>
              An admin reviews the dispute. If it is decided in your favour, everything not yet
              refunded from this seller is returned to you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dispute-reason">What went wrong?</Label>
            <Textarea
              id="dispute-reason"
              aria-invalid={Boolean(form.formState.errors.reason)}
              {...form.register('reason')}
            />
            {form.formState.errors.reason && (
              <p className="text-sm text-destructive">{form.formState.errors.reason.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={openDispute.isPending}>
              {openDispute.isPending ? 'Sending...' : 'Open dispute'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
