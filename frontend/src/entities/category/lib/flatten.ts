import type { Category } from '@/shared/api';

export interface CategoryOption {
  id: string;
  label: string;
  depth: number;
}

export function flattenCategories(categories: Category[], depth = 0): CategoryOption[] {
  return categories.flatMap((category) => [
    { id: category.id, label: category.name, depth },
    ...flattenCategories(category.children, depth + 1),
  ]);
}
