import { Link, useSearchParams } from 'react-router';
import { useLiveProduct } from '@/entities/product';
import { ProductImage } from '@/shared/ui/product-image';
import { useSellerProducts } from '@/entities/seller';
import { ArchiveProductDialog, StockDialog } from '@/features/manage-product';
import type { ProductStatus, SellerProduct } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { Pager } from '@/shared/ui/pager';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { StatusFilter } from '@/shared/ui/status-filter';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const STATUSES: readonly ProductStatus[] = [
  'PENDING_MODERATION',
  'ACTIVE',
  'REJECTED',
  'SOLD_OUT',
  'ARCHIVED',
];

function ProductRow({ product }: { product: SellerProduct }) {
  const live = useLiveProduct(product.id);
  const stock = live?.stock ?? product.stock;
  const status = live?.status ?? product.status;
  const archived = status === 'ARCHIVED';
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <ProductImage src={product.imageUrls[0]} alt="" className="size-10 shrink-0" />
          <div className="min-w-0">
            <Link
              to={`/products/${product.id}`}
              className="block max-w-64 truncate font-medium hover:underline"
            >
              {product.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {product.type === 'AUCTION' ? 'Auction' : 'Fixed price'} · {product.category.name}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={status} />
        {status === 'REJECTED' && product.moderationNote && (
          <p className="mt-1 max-w-48 text-xs text-rose-700">{product.moderationNote}</p>
        )}
      </TableCell>
      <TableCell className="text-right">
        {product.auction ? (
          <span className="text-sm">
            <Price minor={product.auction.currentPriceMinor ?? product.auction.startPriceMinor} />
            <span className="block text-xs text-muted-foreground">
              {product.auction.bidCount} bids
            </span>
          </span>
        ) : (
          <Price minor={live?.priceMinor ?? product.priceMinor} />
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {product.type === 'AUCTION' ? '—' : stock}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          {!archived && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/seller/products/${product.id}/edit`}>Edit</Link>
            </Button>
          )}
          {!archived && product.type === 'FIXED_PRICE' && (
            <StockDialog productId={product.id} title={product.title} stock={stock} />
          )}
          {!archived && <ArchiveProductDialog productId={product.id} title={product.title} />}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function SellerProductsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as ProductStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? '1');
  const products = useSellerProducts(status, page);

  const update = (next: { status?: ProductStatus; page?: number }) => {
    const search = new URLSearchParams();
    if (next.status) search.set('status', next.status);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    setParams(search);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        actions={
          <Button asChild size="sm">
            <Link to="/seller/products/new">New product</Link>
          </Button>
        }
      />
      <StatusFilter
        statuses={STATUSES}
        value={status}
        onChange={(next) => update({ status: next })}
      />
      {products.isPending ? (
        <LoadingState rows={4} label="Loading products" />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : products.data.items.length === 0 ? (
        <EmptyState
          title={status ? 'No products with this status' : 'You have no products yet'}
          action={
            <Button asChild size="sm">
              <Link to="/seller/products/new">Create a product</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.data.items.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </TableBody>
          </Table>
          <Pager
            page={page}
            limit={products.data.limit}
            total={products.data.total}
            onChange={(next) => update({ status, page: next })}
          />
        </>
      )}
    </div>
  );
}
