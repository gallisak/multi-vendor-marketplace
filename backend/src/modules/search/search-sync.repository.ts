import { Injectable } from '@nestjs/common';
import type { ProductStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';
import { PRODUCT_INCLUDE } from '../products/product.mapper.js';

@Injectable()
export class SearchSyncRepository extends PrismaRepository {
  findForIndexing(ids: string[]) {
    return this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        ...PRODUCT_INCLUDE,
        seller: { select: { id: true, storeName: true, isActive: true } },
      },
    });
  }

  async findIdsInCategories(categoryIds: string[], statuses: ProductStatus[]) {
    const products = await this.prisma.product.findMany({
      where: { categoryId: { in: categoryIds }, status: { in: statuses } },
      select: { id: true },
    });
    return products.map((product) => product.id);
  }

  countWithStatus(statuses: ProductStatus[]) {
    return this.prisma.product.count({ where: { status: { in: statuses } } });
  }

  async findIdsAfter(cursor: string | undefined, take: number) {
    const batch = await this.prisma.product.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    return batch.map((product) => product.id);
  }
}
