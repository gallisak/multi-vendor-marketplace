import { ProductStatus, ProductType } from '../../generated/prisma/enums.js';

export const MAX_LINE_QUANTITY = 99;

export const UNAVAILABLE_REASONS = [
  'ARCHIVED',
  'NOT_ACTIVE',
  'SELLER_INACTIVE',
  'AUCTION',
  'OWN_PRODUCT',
  'OUT_OF_STOCK',
  'INSUFFICIENT_STOCK',
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export interface PurchasableProduct {
  status: ProductStatus;
  type: ProductType;
  stock: number;
  seller: { isActive: boolean; userId: string };
}

export function unavailableReason(
  product: PurchasableProduct,
  quantity: number,
  buyerId: string,
): UnavailableReason | null {
  if (product.status === ProductStatus.ARCHIVED) return 'ARCHIVED';
  if (product.status !== ProductStatus.ACTIVE) return 'NOT_ACTIVE';
  if (!product.seller.isActive) return 'SELLER_INACTIVE';
  if (product.type === ProductType.AUCTION) return 'AUCTION';
  if (product.seller.userId === buyerId) return 'OWN_PRODUCT';
  if (product.stock === 0) return 'OUT_OF_STOCK';
  if (product.stock < quantity) return 'INSUFFICIENT_STOCK';
  return null;
}
