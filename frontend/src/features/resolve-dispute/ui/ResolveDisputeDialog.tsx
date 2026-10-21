import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Dispute } from '@/shared/api';
import { formatMoney } from '@/shared/lib';
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
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { type DisputeDecision, useResolveDispute } from '../api/use-resolve-dispute';

const schema = z.object({
  decision: z.enum(['BUYER', 'SELLER']),
  note: z.string().trim().min(3, 'At least 3 characters').max(2000, 'At most 2000 characters'),
});

export function ResolveDisputeDialog({ dispute }: { dispute: Dispute }) {
  const [open, setOpen] = useState(false);
  const resolve = useResolveDispute();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { decision: 'BUYER', note: '' },
  });
  const outstanding = dispute.subtotalMinor - dispute.refundedMinor;

  const decide = (values: { decision: DisputeDecision; note: string }) =>
    resolve.mutate(
      { id: dispute.id, ...values },
      {
        onSuccess: () => {
          toast.success('Dispute resolved');
          setOpen(false);
          form.reset();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Resolve</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => void form.handleSubmit(decide)(event)}
          className="space-y-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Resolve the dispute with {dispute.storeName}</DialogTitle>
            <DialogDescription>
              In favour of the buyer: {formatMoney(outstanding)} not yet refunded goes back to the
              buyer and the commission on it is reversed. In favour of the seller: nothing is
              refunded and a shipped order is completed.
            </DialogDescription>
          </DialogHeader>
          <Controller
            control={form.control}
            name="decision"
            render={({ field }) => (
              <Tabs value={field.value} onValueChange={field.onChange}>
                <TabsList>
                  <TabsTrigger value="BUYER">For the buyer</TabsTrigger>
                  <TabsTrigger value="SELLER">For the seller</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          />
          <FormField
            id="resolution-note"
            label="Decision note"
            error={form.formState.errors.note?.message}
          >
            <Textarea id="resolution-note" {...form.register('note')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={resolve.isPending}>
              Resolve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
