import type { CategoryNode } from '../categories/category-tree.js';
import type { ProductWithRelations } from '../products/product.mapper.js';
import type { ProductSearchDocument } from './search-index.port.js';
import type { ProductStatus } from '../../generated/prisma/enums.js';
import { LISTED_STATUSES } from '../products/catalog.service.js';

export const SEARCHABLE_STATUSES: ProductStatus[] = LISTED_STATUSES;

export function ancestorIds(categories: CategoryNode[], categoryId: string): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const result: string[] = [];
  let current = byId.get(categoryId);
  while (current && !result.includes(current.id)) {
    result.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result.length ? result : [categoryId];
}

export function isSearchable(product: { status: ProductStatus }, sellerActive: boolean) {
  return sellerActive && SEARCHABLE_STATUSES.includes(product.status);
}

export function toSearchDocument(
  product: ProductWithRelations,
  categories: CategoryNode[],
): ProductSearchDocument {
  return {
    id: product.id,
    title: product.title,
    description: product.description.slice(0, 2000),
    type: product.type,
    priceMinor: product.priceMinor,
    currentBidMinor: product.auction?.currentPriceMinor ?? null,
    stock: product.stock,
    inStock: product.stock > 0,
    imageUrl: product.imageUrls[0] ?? null,
    ratingAvg: product.ratingAvg.toNumber(),
    ratingCount: product.ratingCount,
    categoryId: product.category.id,
    categoryName: product.category.name,
    categoryIds: ancestorIds(categories, product.category.id),
    sellerId: product.seller.id,
    sellerName: product.seller.storeName,
    auctionEndsAt: product.auction?.endsAt.getTime() ?? null,
    createdAt: product.createdAt.getTime(),
  };
}
