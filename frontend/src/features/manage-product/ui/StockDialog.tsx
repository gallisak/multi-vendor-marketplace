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
import { Input } from '@/shared/ui/input';
import { errorMessage } from '@/shared/ui/states';
import { useAdjustStock } from '../api/use-product-mutations';

const schemaFor = (stock: number) =>
  z.object({
    delta: z
      .string()
      .trim()
      .refine((value) => /^[+-]?\d+$/.test(value), 'Whole number, e.g. 5 or -2')
      .refine((value) => Number(value) !== 0, 'Cannot be zero')
      .refine((value) => stock + Number(value) >= 0, `Only ${stock} units can be written off`)
      .refine((value) => Math.abs(Number(value)) <= 1_000_000, 'Too many units'),
  });

export function StockDialog({
  productId,
  title,
  stock,
}: {
  productId: string;
  title: string;
  stock: number;
}) {
  const [open, setOpen] = useState(false);
  const adjust = useAdjustStock(productId);
  const form = useForm<{ delta: string }>({
    resolver: zodResolver(schemaFor(stock)),
    defaultValues: { delta: '' },
  });

  const submit = form.handleSubmit(({ delta }) =>
    adjust.mutate(Number(delta), {
      onSuccess: (product) => {
        toast.success(`Stock is now ${product?.stock ?? ''}`);
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
          Stock
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="truncate pr-6">Adjust stock of “{title}”</DialogTitle>
            <DialogDescription>
              {stock} units now. Use a positive number to restock, negative to write off. Buyers see
              the new amount live.
            </DialogDescription>
          </DialogHeader>
          <FormField id="stock-delta" label="Change" error={form.formState.errors.delta?.message}>
            <Input id="stock-delta" inputMode="numeric" {...form.register('delta')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={adjust.isPending}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
