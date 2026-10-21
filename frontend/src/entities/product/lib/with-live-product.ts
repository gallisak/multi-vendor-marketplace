import type { Product } from '@/shared/api';
import type { ProductUpdate } from '@/shared/realtime';

export function withLiveProduct(product: Product, live: ProductUpdate | null): Product {
  if (!live) return product;
  return {
    ...product,
    stock: live.stock,
    priceMinor: live.priceMinor,
    status: live.status as Product['status'],
  };
}
