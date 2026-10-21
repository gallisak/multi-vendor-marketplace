import { useSearchParams } from 'react-router';
import { ProductImage, useModerationQueue } from '@/entities/product';
import { ModerationActions } from '@/features/moderate';
import { ReindexButton } from '@/features/reindex-search';
import type { ProductStatus } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { StatusFilter } from '@/shared/ui/status-filter';

const STATUSES: readonly ProductStatus[] = [
  'PENDING_MODERATION',
  'ACTIVE',
  'REJECTED',
  'SOLD_OUT',
  'ARCHIVED',
];

export function ModerationPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const status =
    raw === 'ALL' ? undefined : ((raw as ProductStatus | null) ?? 'PENDING_MODERATION');
  const products = useModerationQueue(status);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product moderation"
        description="New products and edited content wait here before they reach the catalog"
        actions={<ReindexButton />}
      />
      <StatusFilter
        statuses={STATUSES}
        value={status}
        onChange={(next) => setParams({ status: next ?? 'ALL' })}
      />
      {products.isPending ? (
        <LoadingState rows={3} label="Loading products" />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : products.data.items.length === 0 ? (
        <EmptyState title="Nothing to review" />
      ) : (
        <ul className="space-y-3">
          {products.data.items.map((product) => (
            <li key={product.id} className="flex flex-wrap gap-4 rounded-xl border p-4">
              <ProductImage src={product.imageUrls[0]} alt="" className="size-20 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {product.title} <StatusBadge status={product.status} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {product.seller.storeName} · {product.category.name} ·{' '}
                  {product.type === 'AUCTION' ? 'Auction from ' : ''}
                  <Price minor={product.auction?.startPriceMinor ?? product.priceMinor} />
                  {product.type === 'FIXED_PRICE' && ` · ${product.stock} in stock`} · updated{' '}
                  {formatDateTime(product.updatedAt)}
                </p>
                <p className="line-clamp-3 text-sm whitespace-pre-line">{product.description}</p>
                {product.moderationNote && (
                  <p className="text-sm text-rose-700">Note: {product.moderationNote}</p>
                )}
              </div>
              {product.status === 'PENDING_MODERATION' && (
                <ModerationActions target="products" id={product.id} name={product.title} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
