import type { Prisma } from '../../generated/prisma/client.js';
import type { ProductDto, SellerProductDto } from './products.dto.js';

export const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, storeName: true } },
  auction: true,
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export function toProductDto(product: ProductWithRelations): ProductDto {
  const { auction } = product;
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    type: product.type,
    status: product.status,
    priceMinor: product.priceMinor,
    stock: product.stock,
    imageUrls: product.imageUrls,
    ratingAvg: product.ratingAvg.toNumber(),
    ratingCount: product.ratingCount,
    category: product.category,
    seller: product.seller,
    auction: auction
      ? {
          startPriceMinor: auction.startPriceMinor,
          bidStepMinor: auction.bidStepMinor,
          currentPriceMinor: auction.currentPriceMinor,
          bidCount: auction.bidCount,
          endsAt: auction.endsAt,
          status: auction.status,
        }
      : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function toSellerProductDto(product: ProductWithRelations): SellerProductDto {
  return {
    ...toProductDto(product),
    moderationNote: product.moderationNote,
    version: product.version,
  };
}
