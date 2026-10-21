import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CategorySelect } from '@/entities/category';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { errorMessage } from '@/shared/ui/states';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import { useCreateProduct } from '../api/use-product-mutations';
import {
  type CreateProductInput,
  type CreateProductValues,
  createDefaults,
  createProductSchema,
  toCreatePayload,
} from '../model/product-schema';

export function CreateProductForm() {
  const create = useCreateProduct();
  const navigate = useNavigate();
  const [defaultValues] = useState(createDefaults);
  const form = useForm<CreateProductInput, unknown, CreateProductValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues,
  });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: 'type' });

  const submit = form.handleSubmit((values) =>
    create.mutate(toCreatePayload(values), {
      onSuccess: () => {
        toast.success('Product sent to moderation');
        void navigate('/seller/products');
      },
      onError: (error) => form.setError('root', { message: errorMessage(error) }),
    }),
  );

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4" noValidate>
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <Controller
        control={form.control}
        name="type"
        render={({ field }) => (
          <Tabs value={field.value} onValueChange={field.onChange}>
            <TabsList>
              <TabsTrigger value="FIXED_PRICE">Fixed price</TabsTrigger>
              <TabsTrigger value="AUCTION">Auction</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      />
      <FormField id="title" label="Title" error={errors.title?.message}>
        <Input id="title" aria-invalid={Boolean(errors.title)} {...form.register('title')} />
      </FormField>
      <FormField id="description" label="Description" error={errors.description?.message}>
        <Textarea
          id="description"
          rows={5}
          aria-invalid={Boolean(errors.description)}
          {...form.register('description')}
        />
      </FormField>
      <FormField id="category" label="Category" error={errors.categoryId?.message}>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <CategorySelect
              id="category"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.categoryId)}
            />
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
      {type === 'FIXED_PRICE' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="price" label="Price" error={errors.price?.message}>
            <Input id="price" inputMode="decimal" {...form.register('price')} />
          </FormField>
          <FormField id="stock" label="Units in stock" error={errors.stock?.message}>
            <Input id="stock" inputMode="numeric" {...form.register('stock')} />
          </FormField>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="start-price" label="Start price" error={errors.startPrice?.message}>
            <Input id="start-price" inputMode="decimal" {...form.register('startPrice')} />
          </FormField>
          <FormField id="bid-step" label="Bid step" error={errors.bidStep?.message}>
            <Input id="bid-step" inputMode="decimal" {...form.register('bidStep')} />
          </FormField>
          <FormField id="ends-at" label="Ends at" error={errors.endsAt?.message}>
            <Input id="ends-at" type="datetime-local" {...form.register('endsAt')} />
          </FormField>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        New products appear in the catalog after an admin approves them.
      </p>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Saving...' : 'Create product'}
      </Button>
    </form>
  );
}
