import { zodResolver } from '@hookform/resolvers/zod';
import { Gavel } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/entities/viewer';
import { ApiError, newIdempotencyKey } from '@/shared/api';
import { toMajor, toMinor } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Price } from '@/shared/ui/price';
import { errorMessage } from '@/shared/ui/states';
import { usePlaceBid } from '../api/use-place-bid';
import { bidSchema } from '../model/bid-schema';

export function BidForm({ productId, minimumMinor }: { productId: string; minimumMinor: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const placeBid = usePlaceBid(productId);
  const pendingKey = useRef<{ amountMinor: number; key: string } | null>(null);
  const schema = useMemo(() => bidSchema(minimumMinor), [minimumMinor]);
  const form = useForm<{ amount: string }>({
    resolver: zodResolver(schema),
    defaultValues: { amount: toMajor(minimumMinor) },
  });

  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({ amount: toMajor(minimumMinor) });
    }
  }, [minimumMinor, form]);

  const placeBidFor = ({ amount }: { amount: string }) => {
    if (!user) {
      void navigate('/login', { state: { from: `/products/${productId}` } });
      return;
    }
    const amountMinor = toMinor(amount);
    if (pendingKey.current?.amountMinor !== amountMinor) {
      pendingKey.current = { amountMinor, key: newIdempotencyKey() };
    }
    placeBid.mutate(
      { amountMinor, key: pendingKey.current.key },
      {
        onSuccess: (result) => {
          pendingKey.current = null;
          toast.success('Your bid is the highest now');
          form.reset({ amount: toMajor(result.minNextBidMinor) });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status < 500) pendingKey.current = null;
          toast.error(errorMessage(error));
        },
      },
    );
  };

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(placeBidFor)(event)}
      className="space-y-2"
      noValidate
    >
      <Label htmlFor="bid-amount">Your bid, ₴</Label>
      <div className="flex gap-2">
        <Input id="bid-amount" inputMode="decimal" {...form.register('amount')} />
        <Button type="submit" disabled={placeBid.isPending}>
          <Gavel /> Place bid
        </Button>
      </div>
      {form.formState.errors.amount && (
        <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Minimum next bid: <Price minor={minimumMinor} />
      </p>
    </form>
  );
}
