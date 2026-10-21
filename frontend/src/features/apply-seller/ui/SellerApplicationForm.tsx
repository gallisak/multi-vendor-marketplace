import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { useApplySeller } from '../api/use-apply-seller';

const schema = z.object({
  storeName: z.string().trim().min(2, 'At least 2 characters').max(80, 'At most 80 characters'),
  description: z.string().trim().max(1000, 'At most 1000 characters'),
});

export function SellerApplicationForm() {
  const apply = useApplySeller();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { storeName: '', description: '' },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(({ storeName, description }) =>
    apply.mutate(
      { storeName, description: description || undefined },
      {
        onSuccess: () => {
          toast.success('Application sent for moderation');
          form.reset();
        },
        onError: (error) => form.setError('root', { message: errorMessage(error) }),
      },
    ),
  );

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4" noValidate>
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="store-name">Store name</Label>
        <Input
          id="store-name"
          aria-invalid={Boolean(errors.storeName)}
          {...form.register('storeName')}
        />
        {errors.storeName && <p className="text-sm text-destructive">{errors.storeName.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="store-description">What will you sell? (optional)</Label>
        <Textarea id="store-description" {...form.register('description')} />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>
      <Button type="submit" disabled={apply.isPending}>
        {apply.isPending ? 'Sending...' : 'Apply'}
      </Button>
    </form>
  );
}
