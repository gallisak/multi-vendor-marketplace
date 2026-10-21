import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toMajor } from '@/shared/lib';
import type { Category, SearchResult } from '@/shared/api';
import { cn } from '@/shared/lib';

interface Props {
  params: URLSearchParams;
  onChange: (name: string, value: string | undefined) => void;
  onReset: () => void;
  categories: Category[];
  result: SearchResult | undefined;
}

function CategoryTree({
  nodes,
  selected,
  counts,
  onSelect,
  depth = 0,
}: {
  nodes: Category[];
  selected: string | null;
  counts: Record<string, number>;
  onSelect: (id: string | undefined) => void;
  depth?: number;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onSelect(selected === node.id ? undefined : node.id)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
              selected === node.id && 'bg-muted font-medium',
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <span>{node.name}</span>
            {counts[node.id] !== undefined && (
              <span className="text-xs text-muted-foreground">{counts[node.id]}</span>
            )}
          </button>
          {node.children.length > 0 && (
            <CategoryTree
              nodes={node.children}
              selected={selected}
              counts={counts}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function PriceRange({
  params,
  onChange,
  bounds,
}: {
  params: URLSearchParams;
  onChange: Props['onChange'];
  bounds: SearchResult['priceRange'];
}) {
  const [min, setMin] = useState(params.get('minPrice') ?? '');
  const [max, setMax] = useState(params.get('maxPrice') ?? '');
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onChange('minPrice', min || undefined);
        onChange('maxPrice', max || undefined);
      }}
    >
      <Input
        aria-label="Minimum price"
        inputMode="decimal"
        placeholder={bounds ? toMajor(bounds.min) : 'Min'}
        value={min}
        onChange={(event) => setMin(event.target.value)}
      />
      <Input
        aria-label="Maximum price"
        inputMode="decimal"
        placeholder={bounds ? toMajor(bounds.max) : 'Max'}
        value={max}
        onChange={(event) => setMax(event.target.value)}
      />
      <Button type="submit" variant="outline" size="sm">
        Apply
      </Button>
    </form>
  );
}

export function FiltersPanel({ params, onChange, onReset, categories, result }: Props) {
  const sellerFacet = result?.facets.sellerId ?? {};
  const sellerNames = new Map(result?.items.map((hit) => [hit.sellerId, hit.sellerName]));
  const selectedSeller = params.get('sellerId');
  const sellers = Object.entries(sellerFacet).filter(
    ([id]) => sellerNames.has(id) || id === selectedSeller,
  );
  return (
    <aside className="space-y-6" aria-label="Filters">
      <div>
        <h2 className="mb-2 text-sm font-semibold">Category</h2>
        <CategoryTree
          nodes={categories}
          selected={params.get('categoryId')}
          counts={result?.facets.categoryIds ?? {}}
          onSelect={(id) => onChange('categoryId', id)}
        />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Price, ₴</h2>
        <PriceRange
          key={`${params.get('minPrice')}-${params.get('maxPrice')}`}
          params={params}
          onChange={onChange}
          bounds={result?.priceRange ?? null}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Type</h2>
        <Select
          value={params.get('type') ?? 'all'}
          onValueChange={(value) => onChange('type', value === 'all' ? undefined : value)}
        >
          <SelectTrigger className="w-full" aria-label="Product type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="FIXED_PRICE">
              Buy now{' '}
              {result?.facets.type.FIXED_PRICE !== undefined &&
                `(${result.facets.type.FIXED_PRICE})`}
            </SelectItem>
            <SelectItem value="AUCTION">
              Auctions{' '}
              {result?.facets.type.AUCTION !== undefined && `(${result.facets.type.AUCTION})`}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Rating</h2>
        <Select
          value={params.get('minRating') ?? 'any'}
          onValueChange={(value) => onChange('minRating', value === 'any' ? undefined : value)}
        >
          <SelectTrigger className="w-full" aria-label="Minimum rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any rating</SelectItem>
            <SelectItem value="4">4 stars and up</SelectItem>
            <SelectItem value="3">3 stars and up</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="in-stock"
          checked={params.get('inStock') === 'true'}
          onCheckedChange={(checked) => onChange('inStock', checked === true ? 'true' : undefined)}
        />
        <Label htmlFor="in-stock">
          In stock only
          {result?.facets.inStock.true !== undefined && (
            <span className="text-muted-foreground"> ({result.facets.inStock.true})</span>
          )}
        </Label>
      </div>
      {sellers.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Seller</h2>
          <ul className="space-y-0.5">
            {sellers.map(([id, count]) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onChange('sellerId', selectedSeller === id ? undefined : id)}
                  className={cn(
                    'flex w-full justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
                    selectedSeller === id && 'bg-muted font-medium',
                  )}
                >
                  <span>{sellerNames.get(id) ?? 'Selected seller'}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
        Reset filters
      </Button>
    </aside>
  );
}
