import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class SellersRepository extends PrismaRepository {
  findStatusByUserId(userId: string) {
    return this.prisma.seller.findUnique({
      where: { userId },
      select: { id: true, isActive: true },
    });
  }

  findActive(id: string) {
    return this.prisma.seller.findFirst({ where: { id, isActive: true } });
  }

  async isStoreNameTaken(storeName: string) {
    const taken = await this.prisma.seller.findFirst({
      where: { storeName: { equals: storeName, mode: 'insensitive' } },
      select: { id: true },
    });
    return taken !== null;
  }

  create(
    data: { userId: string; storeName: string; description: string | null },
    tx?: Transaction,
  ) {
    return this.db(tx).seller.create({ data });
  }
}
