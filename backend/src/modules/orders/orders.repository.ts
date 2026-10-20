import { Injectable } from '@nestjs/common';
import type { Paging } from '../../common/pagination.js';
import type {
  OrderStatus,
  PaymentStatus,
  SellerOrderStatus,
} from '../../generated/prisma/enums.js';
import { SellerOrderStatus as Status } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import { ORDER_INCLUDE, SELLER_ORDER_INCLUDE } from './order.mapper.js';
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

  findBuyerSellerOrder(buyerId: string, orderId: string, sellerOrderId: string) {
    return this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, orderId, order: { buyerId } },
      select: { id: true, order: { select: { paymentStatus: true } } },
    });
  }

  async lock(orderId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    return rows.length > 0;
  }

  async orderIdOf(sellerOrderId: string, tx: Transaction) {
    const { orderId } = await tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: { orderId: true },
    });
    return orderId;
  }

  sellerOrderRef(sellerOrderId: string, tx: Transaction) {
    return tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: { orderId: true, sellerId: true },
    });
  }

  sellerOrderState(sellerOrderId: string, tx: Transaction) {
    return tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: { status: true, sellerId: true, order: { select: { buyerId: true } } },
    });
  }

  async moveSellerOrder(
    sellerOrderId: string,
    from: SellerOrderStatus,
    to: SellerOrderStatus,
    reason: string | null,
    tx: Transaction,
  ) {
    const { count } = await tx.sellerOrder.updateMany({
      where: { id: sellerOrderId, status: from },
      data: {
        status: to,
        version: { increment: 1 },
        ...(to === Status.CANCELLED && { cancelReason: reason }),
        ...(to === Status.COMPLETED && { completedAt: new Date() }),
      },
    });
    return count === 1;
  }

  async sellerOrderStatuses(orderId: string, tx: Transaction) {
    const rows = await tx.sellerOrder.findMany({ where: { orderId }, select: { status: true } });
    return rows.map((row) => row.status);
  }

  async setStatus(orderId: string, status: OrderStatus, tx: Transaction) {
    await tx.order.update({ where: { id: orderId }, data: { status, version: { increment: 1 } } });
  }

  sellerOrderForSettlement(sellerOrderId: string, tx: Transaction) {
    return tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      include: {
        items: true,
        refunds: { select: { commissionReversalMinor: true } },
        order: { select: { paymentStatus: true } },
      },
    });
  }

  async markFullyRefunded(sellerOrderId: string, subtotalMinor: bigint, tx: Transaction) {
    await tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { refundedMinor: subtotalMinor },
    });
  }

  findWithPayment(orderId: string, tx: Transaction) {
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true } });
  }

  async applyRefund(
    orderId: string,
    refundedMinor: bigint,
    paymentStatus: PaymentStatus,
    tx: Transaction,
  ) {
    await tx.order.update({
      where: { id: orderId },
      data: { refundedMinor, paymentStatus, version: { increment: 1 } },
    });
    await tx.payment.update({ where: { orderId }, data: { status: paymentStatus } });
  }

  findSellerOrderPage(sellerId: string, status: SellerOrderStatus | undefined, paging: Paging) {
    const where = { sellerId, ...(status && { status }) };
    return this.prisma.$transaction([
      this.prisma.sellerOrder.findMany({
        where,
        include: SELLER_ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
      this.prisma.sellerOrder.count({ where }),
    ]);
  }

  findOwnedSellerOrder(sellerOrderId: string, sellerId: string, tx?: Transaction) {
    return this.db(tx).sellerOrder.findFirst({
      where: { id: sellerOrderId, sellerId },
      include: SELLER_ORDER_INCLUDE,
    });
  }

  getSellerOrder(sellerOrderId: string, tx?: Transaction) {
    return this.db(tx).sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      include: SELLER_ORDER_INCLUDE,
    });
  }

  async refundItem(
    item: { id: string; refundedQuantity: number },
    quantity: number,
    tx: Transaction,
  ) {
    const { count } = await tx.orderItem.updateMany({
      where: { id: item.id, refundedQuantity: item.refundedQuantity },
      data: { refundedQuantity: { increment: quantity } },
    });
    return count === 1;
  }

  async addRefunded(sellerOrderId: string, amountMinor: bigint, tx: Transaction) {
    await tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { refundedMinor: { increment: amountMinor }, version: { increment: 1 } },
    });
  }

  createRefund(
    data: {
      sellerOrderId: string;
      orderItemId: string;
      quantity: number;
      amountMinor: bigint;
      commissionReversalMinor: bigint;
      reason?: string;
      createdById: string;
    },
    tx: Transaction,
  ) {
    return tx.refund.create({ data });
  }
}
