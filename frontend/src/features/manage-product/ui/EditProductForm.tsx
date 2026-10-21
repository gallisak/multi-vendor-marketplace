import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CategorySelect } from '@/entities/category';
import type { SellerProduct } from '@/shared/api';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { errorMessage } from '@/shared/ui/states';
import { Textarea } from '@/shared/ui/textarea';
import { useUpdateProduct } from '../api/use-product-mutations';
import {
  editDefaults,
  type EditProductInput,
  type EditProductValues,
  editProductSchema,
  toPatch,
} from '../model/product-schema';

export function EditProductForm({ product }: { product: SellerProduct }) {
  const update = useUpdateProduct(product.id);
  const form = useForm<EditProductInput, unknown, EditProductValues>({
    resolver: zodResolver(editProductSchema),
    defaultValues: editDefaults(product),
  });
  const { errors } = form.formState;
  const archived = product.status === 'ARCHIVED';

  const submit = form.handleSubmit((values) => {
    const patch = toPatch(product, values);
    if (Object.keys(patch).length === 0) {
      toast.info('Nothing changed');
      return;
    }
    update.mutate(patch, {
      onSuccess: (updated) => {
        if (updated) form.reset(editDefaults(updated));
        toast.success(
          updated?.status === 'PENDING_MODERATION'
            ? 'Saved, the changes go through moderation again'
            : 'Saved',
        );
      },
      onError: (error) => form.setError('root', { message: errorMessage(error) }),
    });
  });

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4" noValidate>
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <fieldset disabled={archived} className="space-y-4">
        <FormField id="title" label="Title" error={errors.title?.message}>
          <Input id="title" aria-invalid={Boolean(errors.title)} {...form.register('title')} />
        </FormField>
        <FormField id="description" label="Description" error={errors.description?.message}>
          <Textarea id="description" rows={5} {...form.register('description')} />
        </FormField>
        <FormField id="category" label="Category" error={errors.categoryId?.message}>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <CategorySelect id="category" value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
        <FormField
          id="images"
          label="Image URLs"
          hint="One http(s) link per line, up to 10"
          error={errors.imageUrls?.message}
        >
          <Textarea id="images" rows={3} {...form.register('imageUrls')} />
        </FormField>
        {product.type === 'FIXED_PRICE' && (
          <FormField
            id="price"
            label="Price"
            hint="Price changes do not need moderation"
            error={errors.price?.message}
          >
            <Input
              id="price"
              inputMode="decimal"
              className="max-w-48"
              {...form.register('price')}
            />
          </FormField>
        )}
        <p className="text-xs text-muted-foreground">
          Changing the title, description, category or images sends an active product back to
          moderation.
        </p>
        <Button type="submit" disabled={update.isPending || archived}>
          {update.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </fieldset>
    </form>
  );
}
