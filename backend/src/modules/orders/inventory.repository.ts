import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export interface ReservedProduct {
  id: string;
  sellerId: string;
  title: string;
  priceMinor: number;
}

@Injectable()
export class InventoryRepository extends PrismaRepository {
  async reserve(productId: string, quantity: number, tx: Transaction) {
    const [reserved] = await tx.$queryRaw<ReservedProduct[]>`
      UPDATE products
      SET stock = stock - ${quantity}, version = version + 1, updated_at = now()
      WHERE id = ${productId}::uuid
        AND status = 'ACTIVE'
        AND type = 'FIXED_PRICE'
        AND stock >= ${quantity}
      RETURNING id, seller_id AS "sellerId", title, price_minor AS "priceMinor"`;
    return reserved;
  }

  async reserveLot(productId: string, tx: Transaction) {
    const [reserved] = await tx.$queryRaw<ReservedProduct[]>`
      UPDATE products
      SET stock = stock - 1, version = version + 1, updated_at = now()
      WHERE id = ${productId}::uuid AND type = 'AUCTION' AND stock >= 1
      RETURNING id, seller_id AS "sellerId", title, price_minor AS "priceMinor"`;
    return reserved;
  }

  async restock(productId: string, quantity: number, tx: Transaction) {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity }, version: { increment: 1 } },
    });
  }
}
