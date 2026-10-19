import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import { SellerApplicationStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class SellerApplicationsRepository extends PrismaRepository {
  create(data: { userId: string; storeName: string; description?: string }) {
    return this.prisma.sellerApplication.create({ data });
  }

  findByUser(userId: string) {
    return this.prisma.sellerApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findPage(status: SellerApplicationStatus | undefined, paging: Paging) {
    const where = status ? { status } : {};
    return this.prisma.$transaction([
      this.prisma.sellerApplication.findMany({ where, orderBy: { createdAt: 'asc' }, ...paging }),
      this.prisma.sellerApplication.count({ where }),
    ]);
  }

  async markReviewed(
    id: string,
    review: {
      status: SellerApplicationStatus;
      reviewedById: string;
      reviewNote?: string;
    },
    tx: Transaction,
  ) {
    const { count } = await tx.sellerApplication.updateMany({
      where: { id, status: SellerApplicationStatus.PENDING },
      data: { ...review, reviewedAt: new Date() },
    });
    return count === 1;
  }

  async exists(id: string, tx: Transaction) {
    return (
      (await tx.sellerApplication.findUnique({ where: { id }, select: { id: true } })) !== null
    );
  }

  get(id: string, tx: Transaction) {
    return tx.sellerApplication.findUniqueOrThrow({ where: { id } });
  }
}
