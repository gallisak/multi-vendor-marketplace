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
}
