import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useCategories } from '../api/category-queries';
import { flattenCategories } from '../lib/flatten';

export function CategorySelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const categories = useCategories();
  const options = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  return (
    <Select value={value} onValueChange={onChange} disabled={categories.isPending}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={categories.isPending ? 'Loading...' : 'Pick a category'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span style={{ paddingLeft: option.depth * 12 }}>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
