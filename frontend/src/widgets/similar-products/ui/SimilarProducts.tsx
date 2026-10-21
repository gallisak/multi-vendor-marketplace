import { ProductCard, useSimilarProducts } from '@/entities/product';

export function SimilarProducts({ productId }: { productId: string }) {
  const similar = useSimilarProducts(productId);
  if (!similar.data?.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Similar products</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {similar.data.map((product) => (
          <ProductCard
            key={product.id}
            product={{
              id: product.id,
              title: product.title,
              priceMinor: product.priceMinor,
              imageUrl: product.imageUrls[0] ?? null,
              sellerName: product.seller.storeName,
              ratingAvg: product.ratingAvg,
              ratingCount: product.ratingCount,
              inStock: product.stock > 0,
              stock: product.stock,
              auctionEndsAt: product.auction?.endsAt ?? null,
            }}
          />
        ))}
      </div>
    </section>
  );
}
