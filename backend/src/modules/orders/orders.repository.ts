import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import { ORDER_INCLUDE } from './order.mapper.js';
import type { OrderDraft } from './pricing.js';

@Injectable()
export class OrdersRepository extends PrismaRepository {
  create(buyerId: string, draft: OrderDraft, tx: Transaction) {
    return tx.order.create({
      data: {
        buyerId,
        totalMinor: draft.totalMinor,
        commissionMinor: draft.commissionMinor,
        payment: { create: { amountMinor: draft.totalMinor } },
        sellerOrders: {
          create: draft.sellerOrders.map((sellerOrder) => ({
            sellerId: sellerOrder.sellerId,
            subtotalMinor: sellerOrder.subtotalMinor,
            commissionRateBps: sellerOrder.commissionRateBps,
            commissionMinor: sellerOrder.commissionMinor,
            items: {
              create: sellerOrder.lines.map((line) => ({
                productId: line.productId,
                titleSnapshot: line.title,
                unitPriceMinor: line.unitPriceMinor,
                quantity: line.quantity,
              })),
            },
          })),
        },
      },
      include: ORDER_INCLUDE,
    });
  }

  findPageForBuyer(buyerId: string, paging: Paging) {
    const where = { buyerId };
    return this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
      this.prisma.order.count({ where }),
    ]);
  }

  findForBuyer(orderId: string, buyerId: string) {
    return this.prisma.order.findFirst({ where: { id: orderId, buyerId }, include: ORDER_INCLUDE });
  }
}
