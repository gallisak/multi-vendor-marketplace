import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sellerApproved } from '../../common/events/domain-events.js';
import { toPage, toSkipTake } from '../../common/pagination.js';
import { Prisma } from '../../generated/prisma/client.js';
import { Role, SellerApplicationStatus } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { AccessTokenRevocationService } from '../auth/access-token-revocation.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { SellerApplicationsRepository } from './seller-applications.repository.js';
import { SellersRepository } from './sellers.repository.js';
import type {
  CreateSellerApplicationDto,
  SellerApplicationDto,
  SellerApplicationsQueryDto,
} from './sellers.dto.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class SellerApplicationsService {
  private readonly logger = new Logger(SellerApplicationsService.name);

  constructor(
    private readonly applications: SellerApplicationsRepository,
    private readonly sellers: SellersRepository,
    private readonly users: UsersRepository,
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxService,
    private readonly revocation: AccessTokenRevocationService,
  ) {}

  async apply(userId: string, dto: CreateSellerApplicationDto): Promise<SellerApplicationDto> {
    const user = await this.users.findById(userId);
    if (user?.role !== Role.CUSTOMER) {
      throw new ConflictException('Only customers can apply to become a seller');
    }
    if (await this.sellers.isStoreNameTaken(dto.storeName)) {
      throw new ConflictException('Store name is already taken');
    }

    try {
      const application = await this.applications.create({
        userId,
        storeName: dto.storeName,
        description: dto.description,
      });
      this.logger.log({ applicationId: application.id, userId }, 'Seller application submitted');
      return application;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('You already have a pending application');
      }
      throw error;
    }
  }

  listOwn(userId: string): Promise<SellerApplicationDto[]> {
    return this.applications.findByUser(userId);
  }

  async list(query: SellerApplicationsQueryDto) {
    const [items, total] = await this.applications.findPage(query.status, toSkipTake(query));
    return toPage<SellerApplicationDto>(items, total, query);
  }

  async approve(applicationId: string, adminId: string, note?: string) {
    try {
      const application = await this.uow.run(async (tx) => {
        const reviewed = await this.markReviewed(
          tx,
          applicationId,
          adminId,
          SellerApplicationStatus.APPROVED,
          note,
        );
        const seller = await this.sellers.create(
          {
            userId: reviewed.userId,
            storeName: reviewed.storeName,
            description: reviewed.description,
          },
          tx,
        );
        if (!(await this.users.promote(reviewed.userId, Role.CUSTOMER, Role.SELLER, tx))) {
          throw new ConflictException('Applicant is no longer a customer');
        }
        await this.outbox.add(
          tx,
          sellerApproved({
            sellerId: seller.id,
            userId: reviewed.userId,
            storeName: reviewed.storeName,
          }),
        );
        return reviewed;
      });

      await this.revocation.revokeIssuedBeforeNow(application.userId);
      this.logger.log(
        { applicationId, adminId, userId: application.userId },
        'Seller application approved',
      );
      return application;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Store name is already taken');
      }
      throw error;
    }
  }

  async reject(applicationId: string, adminId: string, note: string) {
    const application = await this.uow.run((tx) =>
      this.markReviewed(tx, applicationId, adminId, SellerApplicationStatus.REJECTED, note),
    );
    this.logger.log({ applicationId, adminId }, 'Seller application rejected');
    return application;
  }

  private async markReviewed(
    tx: Transaction,
    id: string,
    adminId: string,
    status: SellerApplicationStatus,
    note?: string,
  ) {
    const reviewed = await this.applications.markReviewed(
      id,
      { status, reviewedById: adminId, reviewNote: note },
      tx,
    );
    if (!reviewed) {
      if (!(await this.applications.exists(id, tx))) {
        throw new NotFoundException('Application not found');
      }
      throw new ConflictException('Application has already been reviewed');
    }
    return this.applications.get(id, tx);
  }
}
