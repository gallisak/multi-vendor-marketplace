import { Link, useParams } from 'react-router';
import { useLiveProduct, useProduct, withLiveProduct } from '@/entities/product';
import { ProductImage } from '@/shared/ui/product-image';
import { AddToCart } from '@/features/add-to-cart';
import { Rating } from '@/shared/ui/rating';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { AuctionPanel } from '@/widgets/auction-panel';
import { ProductReviews } from '@/widgets/product-reviews';
import { SimilarProducts } from '@/widgets/similar-products';

export function ProductPage() {
  const { id } = useParams();
  const query = useProduct(id);
  const live = useLiveProduct(id);

  if (query.isPending) return <LoadingState rows={4} label="Loading product" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const product = withLiveProduct(query.data, live);
  return (
    <div className="space-y-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <ProductImage src={product.imageUrls[0]} alt={product.title} className="w-full" />
          {product.imageUrls.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.imageUrls.slice(1, 5).map((url) => (
                <ProductImage key={url} src={url} alt={product.title} />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              <Link to={`/?categoryId=${product.category.id}`} className="hover:underline">
                {product.category.name}
              </Link>{' '}
              ·{' '}
              <Link to={`/?sellerId=${product.seller.id}`} className="hover:underline">
                {product.seller.storeName}
              </Link>
            </p>
            <h1 className="text-2xl font-semibold">{product.title}</h1>
            <div className="flex items-center gap-3">
              <Rating value={product.ratingAvg} count={product.ratingCount} />
              {product.status !== 'ACTIVE' && <StatusBadge status={product.status} />}
            </div>
          </div>
          {product.type === 'AUCTION' ? (
            <AuctionPanel productId={product.id} />
          ) : (
            <AddToCart product={product} />
          )}
          <p className="whitespace-pre-line text-sm leading-relaxed">{product.description}</p>
        </div>
      </div>
      <ProductReviews productId={product.id} />
      <SimilarProducts productId={product.id} />
    </div>
  );
}
