import { useSearchParams } from 'react-router';
import { useCategories } from '@/entities/category';
import { ProductCard, useSearch } from '@/entities/product';
import {
  FiltersPanel,
  filtersFromParams,
  SearchBar,
  SortSelect,
  withParam,
} from '@/features/filter-catalog';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Pager } from '@/shared/ui/pager';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const categories = useCategories();
  const search = useSearch(filters);
  const change = (name: string, value: string | undefined) =>
    setParams((current) => withParam(current, name, value));

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <FiltersPanel
        params={params}
        onChange={change}
        onReset={() => setParams(new URLSearchParams())}
        categories={categories.data ?? []}
        result={search.data}
      />
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-3">
          <SearchBar
            key={params.get('q') ?? ''}
            value={params.get('q') ?? ''}
            onSearch={(q) => change('q', q)}
          />
          <SortSelect value={filters.sort ?? 'newest'} onChange={(sort) => change('sort', sort)} />
        </div>
        {search.data?.degraded && (
          <Alert>
            <AlertTitle>Search is running in a simplified mode</AlertTitle>
            <AlertDescription>
              The search engine is temporarily unavailable, results come straight from the database
              without facet counts.
            </AlertDescription>
          </Alert>
        )}
        {search.isPending ? (
          <LoadingState rows={4} label="Loading products" />
        ) : search.isError ? (
          <ErrorState error={search.error} onRetry={() => void search.refetch()} />
        ) : search.data.items.length === 0 ? (
          <EmptyState title="Nothing found" description="Try another query or fewer filters." />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{search.data.total} products</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {search.data.items.map((hit) => (
                <ProductCard
                  key={hit.id}
                  product={{
                    ...hit,
                    auctionEndsAt: hit.auctionEndsAt
                      ? new Date(hit.auctionEndsAt).toISOString()
                      : null,
                  }}
                />
              ))}
            </div>
            <Pager
              page={search.data.page}
              limit={search.data.limit}
              total={search.data.total}
              onChange={(page) => change('page', String(page))}
            />
          </>
        )}
      </div>
    </div>
  );
}
