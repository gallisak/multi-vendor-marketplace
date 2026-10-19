import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

const SELECT = { id: true, name: true, slug: true, parentId: true } as const;

@Injectable()
export class CategoriesRepository extends PrismaRepository {
  findAll() {
    return this.prisma.category.findMany({ select: SELECT });
  }

  async exists(id: string) {
    return (
      (await this.prisma.category.findUnique({ where: { id }, select: { id: true } })) !== null
    );
  }

  create(data: { name: string; slug: string; parentId: string | null }) {
    return this.prisma.category.create({ data, select: SELECT });
  }

  update(
    id: string,
    data: { name?: string; slug?: string; parentId?: string | null },
    tx?: Transaction,
  ) {
    return this.db(tx).category.update({ where: { id }, data, select: SELECT });
  }

  usage(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      select: { _count: { select: { children: true, products: true } } },
    });
  }

  async delete(id: string) {
    await this.prisma.category.delete({ where: { id } });
  }
}
