import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderDto } from './orders.dto.js';
import { lineTotal } from './pricing.js';

export const ORDER_INCLUDE = {
  sellerOrders: {
    include: { seller: { select: { storeName: true } }, items: { orderBy: { productId: 'asc' } } },
    orderBy: { sellerId: 'asc' },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export function toOrderDto(order: OrderWithRelations): OrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalMinor: Number(order.totalMinor),
    refundedMinor: Number(order.refundedMinor),
    createdAt: order.createdAt,
    sellerOrders: order.sellerOrders.map((sellerOrder) => ({
      id: sellerOrder.id,
      sellerId: sellerOrder.sellerId,
      storeName: sellerOrder.seller.storeName,
      status: sellerOrder.status,
      subtotalMinor: Number(sellerOrder.subtotalMinor),
      refundedMinor: Number(sellerOrder.refundedMinor),
      items: sellerOrder.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        title: item.titleSnapshot,
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
        refundedQuantity: item.refundedQuantity,
        lineTotalMinor: Number(lineTotal(item)),
      })),
    })),
  };
}
