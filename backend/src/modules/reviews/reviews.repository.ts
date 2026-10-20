import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SellerOrderStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

const WITH_AUTHOR = { author: { select: { name: true } } } as const;

@Injectable()
export class ReviewsRepository extends PrismaRepository {
  async lockProduct(productId: string, tx: Transaction) {
    const [product] = await tx.$queryRaw<{ id: string; sellerId: string }[]>`
      SELECT id, seller_id AS "sellerId" FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    return product;
  }

  async exists(productId: string, authorId: string, tx: Transaction) {
    const review = await tx.review.findUnique({
      where: { productId_authorId: { productId, authorId } },
      select: { id: true },
    });
    return review !== null;
  }

  findReceivedPurchase(productId: string, buyerId: string, tx: Transaction) {
    return tx.orderItem.findFirst({
      where: {
        productId,
        sellerOrder: { status: SellerOrderStatus.COMPLETED, order: { buyerId } },
        refundedQuantity: { lt: tx.orderItem.fields.quantity },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  create(
    data: {
      productId: string;
      authorId: string;
      orderItemId: string;
      rating: number;
      comment?: string;
    },
    tx: Transaction,
  ) {
    return tx.review.create({ data, include: WITH_AUTHOR });
  }

  async refreshProductRating(productId: string, tx: Transaction) {
    const [{ avg, count }] = await tx.$queryRaw<{ avg: string | null; count: number }[]>`
      SELECT ROUND(AVG(rating)::numeric, 2)::text AS avg, COUNT(*)::int AS count
      FROM reviews WHERE product_id = ${productId}::uuid`;
    const ratingAvg = new Prisma.Decimal(avg ?? 0);
    await tx.product.update({
      where: { id: productId },
      data: { ratingAvg, ratingCount: count, version: { increment: 1 } },
    });
    return { ratingAvg: ratingAvg.toNumber(), ratingCount: count };
  }

  async refreshSellerRating(sellerId: string, tx: Transaction) {
    await tx.$queryRaw`SELECT id FROM sellers WHERE id = ${sellerId}::uuid FOR UPDATE`;
    const [{ avg, count }] = await tx.$queryRaw<{ avg: string | null; count: number }[]>`
      SELECT ROUND(AVG(r.rating)::numeric, 2)::text AS avg, COUNT(*)::int AS count
      FROM reviews r JOIN products p ON p.id = r.product_id
      WHERE p.seller_id = ${sellerId}::uuid`;
    await tx.seller.update({
      where: { id: sellerId },
      data: { ratingAvg: new Prisma.Decimal(avg ?? 0), ratingCount: count },
    });
  }

  productRating(productId: string) {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: { status: true, ratingAvg: true, ratingCount: true },
    });
  }

  findPage(productId: string, paging: Paging) {
    const where = { productId };
    return this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: WITH_AUTHOR,
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
      this.prisma.review.count({ where }),
    ]);
  }
}
