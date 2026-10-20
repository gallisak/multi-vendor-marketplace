import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class RealtimeSnapshotsRepository extends PrismaRepository {
  product(productId: string) {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, version: true, status: true, stock: true, priceMinor: true },
    });
  }

  auction(productId: string) {
    return this.prisma.auction.findUnique({
      where: { productId },
      include: {
        leader: { select: { name: true } },
        product: { select: { status: true } },
      },
    });
  }

  order(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        sellerOrders: {
          select: { id: true, status: true, version: true },
          orderBy: { sellerId: 'asc' },
        },
      },
    });
  }

  sellerOrders(orderId: string) {
    return this.prisma.sellerOrder.findMany({
      where: { orderId },
      include: {
        seller: { select: { userId: true } },
        order: { select: { paymentStatus: true } },
      },
    });
  }
}
