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

  create(data: { email: string; name: string; passwordHash: string }, tx?: Transaction) {
    return this.db(tx).user.create({ data });
  }

  async promote(userId: string, from: Role, to: Role, tx?: Transaction) {
    const { count } = await this.db(tx).user.updateMany({
      where: { id: userId, role: from },
      data: { role: to },
    });
    return count === 1;
  }
}
