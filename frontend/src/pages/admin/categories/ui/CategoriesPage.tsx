import { Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { type CategoryOption, flattenCategories, useCategories } from '@/entities/category';
import { CategoryDialog, DeleteCategoryButton } from '@/features/manage-categories';
import type { Category } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';

function CategoryNode({ category, options }: { category: Category; options: CategoryOption[] }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
        <span className="min-w-0">
          <span className="font-medium">{category.name}</span>{' '}
          <span className="text-xs text-muted-foreground">/{category.slug}</span>
        </span>
        <span className="flex shrink-0">
          <CategoryDialog
            options={options}
            parentId={category.id}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Add a subcategory to ${category.name}`}
              >
                <Plus />
              </Button>
            }
          />
          <CategoryDialog
            options={options}
            category={category}
            trigger={
              <Button size="sm" variant="ghost" aria-label={`Edit ${category.name}`}>
                <Pencil />
              </Button>
            }
          />
          <DeleteCategoryButton id={category.id} name={category.name} />
        </span>
      </div>
      {category.children.length > 0 && (
        <ul className="ml-4 border-l pl-2">
          {category.children.map((child) => (
            <CategoryNode key={child.id} category={child} options={options} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoriesPage() {
  const categories = useCategories();
  const options = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categories"
        description="A category with products or subcategories cannot be deleted"
        actions={
          <CategoryDialog
            options={options}
            trigger={
              <Button size="sm">
                <Plus /> New category
              </Button>
            }
          />
        }
      />
      {categories.isPending ? (
        <LoadingState rows={4} label="Loading categories" />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <EmptyState title="No categories yet" />
      ) : (
        <ul className="max-w-2xl rounded-xl border p-2">
          {categories.data.map((category) => (
            <CategoryNode key={category.id} category={category} options={options} />
          ))}
        </ul>
      )}
    </div>
  );
}
