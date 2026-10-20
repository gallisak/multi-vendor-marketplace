import { Injectable } from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class UsersRepository extends PrismaRepository {
  findById(id: string, tx?: Transaction) {
    return this.db(tx).user.findUnique({ where: { id } });
  }

  findByEmail(email: string, tx?: Transaction) {
    return this.db(tx).user.findUnique({ where: { email } });
  }

  findByGoogleId(googleId: string, tx?: Transaction) {
    return this.db(tx).user.findUnique({ where: { googleId } });
  }

  create(
    data: { email: string; name: string; passwordHash?: string; googleId?: string },
    tx?: Transaction,
  ) {
    return this.db(tx).user.create({ data });
  }

  async linkGoogleAccount(userId: string, googleId: string, tx?: Transaction) {
    const { count } = await this.db(tx).user.updateMany({
      where: { id: userId, googleId: null },
      data: { googleId, passwordHash: null },
    });
    return count === 1;
  }

  async promote(userId: string, from: Role, to: Role, tx?: Transaction) {
    const { count } = await this.db(tx).user.updateMany({
      where: { id: userId, role: from },
      data: { role: to },
    });
    return count === 1;
  }
}
