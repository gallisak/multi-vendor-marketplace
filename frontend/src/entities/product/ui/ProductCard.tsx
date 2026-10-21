import { Gavel } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent } from '@/shared/ui/card';
import { timeLeft } from '@/shared/lib';
import { Price } from '@/shared/ui/price';
import { ProductImage } from './ProductImage';
import { Rating } from '@/shared/ui/rating';

export interface ProductCardData {
  id: string;
  title: string;
  priceMinor: number;
  imageUrl: string | null;
  sellerName: string;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
  stock: number;
  auctionEndsAt?: string | null;
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const isAuction = Boolean(product.auctionEndsAt);
  return (
    <Card className="h-full overflow-hidden py-0 transition-shadow hover:shadow-md">
      <Link to={`/products/${product.id}`} className="flex h-full flex-col">
        <ProductImage src={product.imageUrl} alt={product.title} className="rounded-none" />
        <CardContent className="flex flex-1 flex-col gap-1.5 p-3">
          <p className="line-clamp-2 font-medium leading-snug">{product.title}</p>
          <p className="text-xs text-muted-foreground">{product.sellerName}</p>
          <Rating value={product.ratingAvg} count={product.ratingCount} />
          <div className="mt-auto flex items-center justify-between pt-1">
            <Price minor={product.priceMinor} className="font-semibold" />
            {isAuction ? (
              <Badge variant="secondary">
                <Gavel /> {timeLeft(product.auctionEndsAt!)}
              </Badge>
            ) : product.inStock ? (
              <span className="text-xs text-muted-foreground">
                {product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'}
              </span>
            ) : (
              <Badge variant="outline">Out of stock</Badge>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
