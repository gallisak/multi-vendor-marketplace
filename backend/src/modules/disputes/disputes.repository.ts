import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DisputeStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export const DISPUTE_SELECT = {
  id: true,
  sellerOrderId: true,
  status: true,
  reason: true,
  resolutionNote: true,
  createdAt: true,
  resolvedAt: true,
  sellerOrder: {
    select: {
      orderId: true,
      status: true,
      subtotalMinor: true,
      refundedMinor: true,
      seller: { select: { storeName: true } },
    },
  },
} satisfies Prisma.DisputeSelect;

export type DisputeRow = Prisma.DisputeGetPayload<{ select: typeof DISPUTE_SELECT }>;

export interface DisputeScope {
  openedById?: string;
  sellerId?: string;
  status?: DisputeStatus;
}

@Injectable()
export class DisputesRepository extends PrismaRepository {
  sellerOrderForDispute(sellerOrderId: string, tx: Transaction) {
    return tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: {
        status: true,
        subtotalMinor: true,
        refundedMinor: true,
        order: { select: { paymentStatus: true } },
        seller: { select: { userId: true } },
        disputes: {
          where: {
            status: { in: [DisputeStatus.RESOLVED_FOR_BUYER, DisputeStatus.RESOLVED_FOR_SELLER] },
          },
          select: { id: true },
        },
      },
    });
  }

  create(data: { sellerOrderId: string; openedById: string; reason: string }, tx: Transaction) {
    return tx.dispute.create({ data, select: DISPUTE_SELECT });
  }

  async withdraw(disputeId: string, buyerId: string) {
    const { count } = await this.prisma.dispute.updateMany({
      where: { id: disputeId, openedById: buyerId, status: DisputeStatus.OPEN },
      data: { status: DisputeStatus.CLOSED, resolvedAt: new Date() },
    });
    return count === 1;
  }

  findVisible(disputeId: string, openedById?: string) {
    return this.prisma.dispute.findFirst({
      where: { id: disputeId, ...(openedById && { openedById }) },
      select: DISPUTE_SELECT,
    });
  }

  async orderIdOf(disputeId: string, tx: Transaction) {
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      select: { sellerOrder: { select: { orderId: true } } },
    });
    return dispute?.sellerOrder.orderId ?? null;
  }

  async sellerOrderOf(disputeId: string, tx: Transaction) {
    const { sellerOrder } = await tx.dispute.findUniqueOrThrow({
      where: { id: disputeId },
      include: {
        sellerOrder: {
          include: { items: true, seller: { select: { userId: true } }, order: true },
        },
      },
    });
    return sellerOrder;
  }

  async resolveOpen(
    disputeId: string,
    resolution: { status: DisputeStatus; resolutionNote: string; resolvedById: string },
    tx: Transaction,
  ) {
    const { count } = await tx.dispute.updateMany({
      where: { id: disputeId, status: DisputeStatus.OPEN },
      data: { ...resolution, resolvedAt: new Date() },
    });
    return count === 1;
  }

  get(disputeId: string, tx: Transaction) {
    return tx.dispute.findUniqueOrThrow({ where: { id: disputeId }, select: DISPUTE_SELECT });
  }

  findPage(scope: DisputeScope, paging: Paging) {
    const where: Prisma.DisputeWhereInput = {
      ...(scope.openedById && { openedById: scope.openedById }),
      ...(scope.sellerId && { sellerOrder: { sellerId: scope.sellerId } }),
      ...(scope.status && { status: scope.status }),
    };
    return this.prisma.$transaction([
      this.prisma.dispute.findMany({
        where,
        select: DISPUTE_SELECT,
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
      this.prisma.dispute.count({ where }),
    ]);
  }
}
