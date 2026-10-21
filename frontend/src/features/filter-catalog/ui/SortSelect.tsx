import type { CatalogSort } from '@/entities/product';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export function SortSelect({
  value,
  onChange,
}: {
  value: CatalogSort;
  onChange: (sort: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label="Sort">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">Newest</SelectItem>
        <SelectItem value="price_asc">Price: low to high</SelectItem>
        <SelectItem value="price_desc">Price: high to low</SelectItem>
        <SelectItem value="rating">Best rated</SelectItem>
      </SelectContent>
    </Select>
  );
}
