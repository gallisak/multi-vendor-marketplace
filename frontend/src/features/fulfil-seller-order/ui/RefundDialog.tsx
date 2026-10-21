import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError, newIdempotencyKey, type OrderItem, type SellerOrder } from '@/shared/api';
import { formatMoney } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
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
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { useRefundItem } from '../api/use-seller-order-actions';
import { refundableQuantity, restockIsOptional } from '../lib/seller-order-rules';

const schemaFor = (max: number) =>
  z.object({
    quantity: z
      .string()
      .trim()
      .refine((value) => /^\d+$/.test(value), 'Whole number of units')
      .refine((value) => Number(value) >= 1 && Number(value) <= max, `Between 1 and ${max}`),
    reason: z
      .string()
      .trim()
      .max(500, 'At most 500 characters')
      .refine((value) => value.length === 0 || value.length >= 3, 'At least 3 characters'),
    restock: z.boolean(),
  });

type RefundValues = z.infer<ReturnType<typeof schemaFor>>;

export function RefundDialog({ order, item }: { order: SellerOrder; item: OrderItem }) {
  const [open, setOpen] = useState(false);
  const refund = useRefundItem(order.id);
  const max = refundableQuantity(item);
  const schema = useMemo(() => schemaFor(max), [max]);
  const optionalRestock = restockIsOptional(order);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const form = useForm<RefundValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: '1', reason: '', restock: false },
  });
  const quantity = Number(useWatch({ control: form.control, name: 'quantity' })) || 0;

  const refundWith = (values: RefundValues) => {
    const body = {
      orderItemId: item.id,
      quantity: Number(values.quantity),
      reason: values.reason || undefined,
      restock: optionalRestock ? values.restock : undefined,
    };
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newIdempotencyKey() };
    }
    refund.mutate(
      { ...body, key: attempt.current.key },
      {
        onSuccess: () => {
          attempt.current = null;
          toast.success(`Refunded ${formatMoney(item.unitPriceMinor * body.quantity)}`);
          setOpen(false);
          form.reset();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status < 500) attempt.current = null;
          toast.error(errorMessage(error));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => void form.handleSubmit(refundWith)(event)}
          className="space-y-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle className="truncate pr-6">Refund “{item.title}”</DialogTitle>
            <DialogDescription>
              {max} of {item.quantity} units can still be refunded. The platform commission for
              these units is reversed.
            </DialogDescription>
          </DialogHeader>
          <FormField
            id="refund-quantity"
            label="Units"
            error={form.formState.errors.quantity?.message}
            hint={
              quantity >= 1 && quantity <= max
                ? `Buyer gets ${formatMoney(item.unitPriceMinor * quantity)}`
                : undefined
            }
          >
            <Input id="refund-quantity" inputMode="numeric" {...form.register('quantity')} />
          </FormField>
          <FormField
            id="refund-reason"
            label="Reason (optional)"
            error={form.formState.errors.reason?.message}
          >
            <Textarea id="refund-reason" {...form.register('reason')} />
          </FormField>
          {optionalRestock ? (
            <Controller
              control={form.control}
              name="restock"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="refund-restock"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <Label htmlFor="refund-restock">The item came back, return it to stock</Label>
                </div>
              )}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              The order is not shipped yet, so the units go back to stock.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={refund.isPending}>
              {refund.isPending ? 'Refunding...' : 'Refund'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
