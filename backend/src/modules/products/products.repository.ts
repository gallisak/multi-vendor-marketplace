import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuctionStatus, ProductStatus, type ProductType } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import { PRODUCT_INCLUDE } from './product.mapper.js';
import type { CatalogSort } from './products.dto.js';

export interface CatalogFilter {
  statuses: ProductStatus[];
  categoryIds?: string[];
  sellerId?: string;
  type?: ProductType;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
}

export interface NewProduct {
  sellerId: string;
  categoryId: string;
  title: string;
  description: string;
  type: ProductType;
  status: ProductStatus;
  priceMinor: number;
  stock: number;
  imageUrls: string[];
  auction?: { startPriceMinor: number; bidStepMinor: number; endsAt: Date };
}

export interface ProductEdit {
  title?: string;
  description?: string;
  categoryId?: string;
  imageUrls?: string[];
  priceMinor?: number;
  status: ProductStatus;
  moderationNote?: null;
}

const ORDER_BY: Record<CatalogSort, Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  price_asc: [{ priceMinor: 'asc' }, { id: 'asc' }],
  price_desc: [{ priceMinor: 'desc' }, { id: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'desc' }],
};

function catalogWhere(filter: CatalogFilter): Prisma.ProductWhereInput {
  return {
    status: { in: filter.statuses },
    seller: { isActive: true },
    ...(filter.categoryIds && { categoryId: { in: filter.categoryIds } }),
    ...(filter.sellerId && { sellerId: filter.sellerId }),
    ...(filter.type && { type: filter.type }),
    ...(filter.q && { title: { contains: filter.q, mode: 'insensitive' } }),
    ...((filter.minPrice !== undefined || filter.maxPrice !== undefined) && {
      priceMinor: { gte: filter.minPrice, lte: filter.maxPrice },
    }),
    ...(filter.minRating !== undefined && { ratingAvg: { gte: filter.minRating } }),
    ...(filter.inStock !== undefined && {
      stock: filter.inStock ? { gt: 0 } : { equals: 0 },
    }),
  };
}

@Injectable()
export class ProductsRepository extends PrismaRepository {
  findCatalogPage(filter: CatalogFilter, sort: CatalogSort, paging: Paging) {
    const where = catalogWhere(filter);
    return this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: ORDER_BY[sort],
        ...paging,
      }),
      this.prisma.product.count({ where }),
    ]);
  }

  findVisible(id: string, statuses: ProductStatus[]) {
    return this.prisma.product.findFirst({
      where: { id, status: { in: statuses }, seller: { isActive: true } },
      include: PRODUCT_INCLUDE,
    });
  }

  findSimilar(
    product: { id: string; categoryId: string },
    statuses: ProductStatus[],
    take: number,
  ) {
    return this.prisma.product.findMany({
      where: {
        id: { not: product.id },
        categoryId: product.categoryId,
        status: { in: statuses },
        seller: { isActive: true },
      },
      include: PRODUCT_INCLUDE,
      orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  findOwned(id: string, sellerId: string) {
    return this.prisma.product.findFirst({ where: { id, sellerId }, include: PRODUCT_INCLUDE });
  }

  findPageBySeller(sellerId: string, status: ProductStatus | undefined, paging: Paging) {
    const where = { sellerId, ...(status && { status }) };
    return this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
      this.prisma.product.count({ where }),
    ]);
  }

  findPageByStatus(status: ProductStatus, paging: Paging) {
    const where = { status };
    return this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { updatedAt: 'asc' },
        ...paging,
      }),
      this.prisma.product.count({ where }),
    ]);
  }

  get(id: string) {
    return this.prisma.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_INCLUDE });
  }

  findForModeration(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: { auction: { select: { endsAt: true } } },
    });
  }

  create({ auction, ...data }: NewProduct, tx?: Transaction) {
    return this.db(tx).product.create({
      data: { ...data, auction: auction ? { create: auction } : undefined },
      include: PRODUCT_INCLUDE,
    });
  }

  async updateVersioned(
    product: { id: string; sellerId: string; version: number },
    data: ProductEdit | { status: ProductStatus },
    tx?: Transaction,
  ) {
    const { count } = await this.db(tx).product.updateMany({
      where: { id: product.id, sellerId: product.sellerId, version: product.version },
      data: { ...data, version: { increment: 1 } },
    });
    return count === 1;
  }

  async adjustStock(product: { id: string; sellerId: string }, delta: number, tx?: Transaction) {
    const { count } = await this.db(tx).product.updateMany({
      where: {
        id: product.id,
        sellerId: product.sellerId,
        status: { not: ProductStatus.ARCHIVED },
        ...(delta < 0 && { stock: { gte: -delta } }),
      },
      data: { stock: { increment: delta }, version: { increment: 1 } },
    });
    return count === 1;
  }

  async moderate(id: string, to: ProductStatus, note: string | null, tx?: Transaction) {
    const { count } = await this.db(tx).product.updateMany({
      where: { id, status: ProductStatus.PENDING_MODERATION },
      data: { status: to, moderationNote: note, version: { increment: 1 } },
    });
    return count === 1;
  }

  async cancelIdleAuction(auctionId: string, tx?: Transaction) {
    const { count } = await this.db(tx).auction.updateMany({
      where: { id: auctionId, status: AuctionStatus.ACTIVE, bidCount: 0 },
      data: { status: AuctionStatus.CANCELLED, version: { increment: 1 } },
    });
    return count === 1;
  }

  async startAuctionWindowNow(productId: string, tx: Transaction) {
    await tx.$executeRaw`
      UPDATE auctions SET starts_at = now(), updated_at = now()
      WHERE product_id = ${productId}::uuid AND status = 'ACTIVE' AND bid_count = 0
        AND starts_at < now()`;
  }
}
