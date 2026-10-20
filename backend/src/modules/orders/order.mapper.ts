import type { Prisma } from '../../generated/prisma/client.js';
import { SellerOrderStatus } from '../../generated/prisma/enums.js';
import type { OrderDto, SellerOrderDto } from './orders.dto.js';
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
      cancelReason: sellerOrder.cancelReason,
      items: sellerOrder.items.map(toItemDto),
    })),
  };
}

function toItemDto(item: OrderWithRelations['sellerOrders'][number]['items'][number]) {
  return {
    id: item.id,
    productId: item.productId,
    title: item.titleSnapshot,
    unitPriceMinor: item.unitPriceMinor,
    quantity: item.quantity,
    refundedQuantity: item.refundedQuantity,
    lineTotalMinor: Number(lineTotal(item)),
  };
}

export const SELLER_ORDER_INCLUDE = {
  items: { orderBy: { productId: 'asc' } },
  refunds: { select: { commissionReversalMinor: true } },
  order: { select: { paymentStatus: true } },
} satisfies Prisma.SellerOrderInclude;

export type SellerOrderWithRelations = Prisma.SellerOrderGetPayload<{
  include: typeof SELLER_ORDER_INCLUDE;
}>;

export function sellerPayout(sellerOrder: {
  status: SellerOrderStatus;
  subtotalMinor: bigint;
  commissionMinor: bigint;
  refundedMinor: bigint;
  refunds: { commissionReversalMinor: bigint }[];
}): bigint {
  if (sellerOrder.status === SellerOrderStatus.CANCELLED) {
    return 0n;
  }
  const reversed = sellerOrder.refunds.reduce((sum, r) => sum + r.commissionReversalMinor, 0n);
  return (
    sellerOrder.subtotalMinor - sellerOrder.refundedMinor - (sellerOrder.commissionMinor - reversed)
  );
}

export function toSellerOrderDto(sellerOrder: SellerOrderWithRelations): SellerOrderDto {
  return {
    id: sellerOrder.id,
    orderId: sellerOrder.orderId,
    status: sellerOrder.status,
    paymentStatus: sellerOrder.order.paymentStatus,
    subtotalMinor: Number(sellerOrder.subtotalMinor),
    commissionRateBps: sellerOrder.commissionRateBps,
    commissionMinor: Number(sellerOrder.commissionMinor),
    refundedMinor: Number(sellerOrder.refundedMinor),
    payoutMinor: Number(sellerPayout(sellerOrder)),
    cancelReason: sellerOrder.cancelReason,
    items: sellerOrder.items.map(toItemDto),
    createdAt: sellerOrder.createdAt,
    updatedAt: sellerOrder.updatedAt,
  };
}
