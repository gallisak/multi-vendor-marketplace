import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/shared/ui/button';
import { RatingInput } from '@/shared/ui/rating';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { useCreateReview } from '../api/use-create-review';

const schema = z.object({
  rating: z.number().int().min(1, 'Pick a rating').max(5),
  comment: z.string().trim().max(2000).optional(),
});

type ReviewValues = z.infer<typeof schema>;

export function ReviewForm({ productId }: { productId: string }) {
  const create = useCreateReview(productId);
  const form = useForm<ReviewValues>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 0, comment: '' },
  });
  const submit = form.handleSubmit((values) =>
    create.mutate(
      { rating: values.rating, comment: values.comment || undefined },
      {
        onSuccess: () => {
          toast.success('Thanks for your review');
          form.reset();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    ),
  );
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border p-4" noValidate>
      <p className="text-sm font-medium">Write a review</p>
      <Controller
        control={form.control}
        name="rating"
        render={({ field }) => <RatingInput value={field.value} onChange={field.onChange} />}
      />
      {form.formState.errors.rating && (
        <p className="text-sm text-destructive">{form.formState.errors.rating.message}</p>
      )}
      <Textarea placeholder="What did you like or dislike?" {...form.register('comment')} />
      <p className="text-xs text-muted-foreground">
        Only buyers who received this product can review it.
      </p>
      <Button type="submit" size="sm" disabled={create.isPending}>
        Publish review
      </Button>
    </form>
  );
}
