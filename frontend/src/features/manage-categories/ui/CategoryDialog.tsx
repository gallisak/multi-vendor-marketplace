import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type CategoryOption } from '@/entities/category';
import type { Category } from '@/shared/api';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { errorMessage } from '@/shared/ui/states';
import { useCreateCategory, useUpdateCategory } from '../api/use-category-mutations';
import { categorySchema, type CategoryValues, NO_PARENT } from '../model/category-schema';

function descendantIds(category: Category): string[] {
  return category.children.flatMap((child) => [child.id, ...descendantIds(child)]);
}

export function CategoryDialog({
  trigger,
  options,
  category,
  parentId,
}: {
  trigger: ReactNode;
  options: CategoryOption[];
  category?: Category;
  parentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const pending = create.isPending || update.isPending;
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      parentId: category?.parentId ?? parentId ?? NO_PARENT,
    },
  });
  const { errors } = form.formState;
  const parents = useMemo(() => {
    if (!category) return options;
    const excluded = new Set([category.id, ...descendantIds(category)]);
    return options.filter((option) => !excluded.has(option.id));
  }, [options, category]);

  const save = async (values: CategoryValues) => {
    const body = {
      name: values.name,
      slug: values.slug || undefined,
      parentId: values.parentId === NO_PARENT ? null : values.parentId,
    };
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, ...body });
        toast.success('Category updated');
      } else {
        await create.mutateAsync(body);
        toast.success('Category created');
        form.reset();
      }
      setOpen(false);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => void form.handleSubmit(save)(event)}
          className="space-y-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{category ? `Edit “${category.name}”` : 'New category'}</DialogTitle>
          </DialogHeader>
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <FormField id="category-name" label="Name" error={errors.name?.message}>
            <Input id="category-name" {...form.register('name')} />
          </FormField>
          <FormField
            id="category-slug"
            label="Slug"
            hint="Leave empty to generate it from the name"
            error={errors.slug?.message}
          >
            <Input id="category-slug" {...form.register('slug')} />
          </FormField>
          <FormField id="category-parent" label="Parent">
            <Controller
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="category-parent" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>No parent (top level)</SelectItem>
                    {parents.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <span style={{ paddingLeft: option.depth * 12 }}>{option.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {category ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
