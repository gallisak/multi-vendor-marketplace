import { OrderStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';

export const SELLER_ORDER_TRANSITIONS: Record<SellerOrderStatus, readonly SellerOrderStatus[]> = {
  [SellerOrderStatus.NEW]: [SellerOrderStatus.PROCESSING, SellerOrderStatus.CANCELLED],
  [SellerOrderStatus.PROCESSING]: [SellerOrderStatus.SHIPPED, SellerOrderStatus.CANCELLED],
  [SellerOrderStatus.SHIPPED]: [SellerOrderStatus.COMPLETED],
  [SellerOrderStatus.COMPLETED]: [],
  [SellerOrderStatus.CANCELLED]: [],
};

export const CANCELLABLE_STATUSES: SellerOrderStatus[] = Object.entries(SELLER_ORDER_TRANSITIONS)
  .filter(([, next]) => next.includes(SellerOrderStatus.CANCELLED))
  .map(([status]) => status as SellerOrderStatus);

export function canTransition(from: SellerOrderStatus, to: SellerOrderStatus): boolean {
  return SELLER_ORDER_TRANSITIONS[from].includes(to);
}

export function aggregateOrderStatus(statuses: SellerOrderStatus[]): OrderStatus {
  const active = statuses.filter((status) => status !== SellerOrderStatus.CANCELLED);
  if (active.length === 0) {
    return OrderStatus.CANCELLED;
  }

  const count = (status: SellerOrderStatus) => active.filter((s) => s === status).length;
  const completed = count(SellerOrderStatus.COMPLETED);
  const shipped = count(SellerOrderStatus.SHIPPED);

  if (completed === active.length) return OrderStatus.COMPLETED;
  if (completed > 0) return OrderStatus.PARTIALLY_COMPLETED;
  if (shipped === active.length) return OrderStatus.SHIPPED;
  if (shipped > 0) return OrderStatus.PARTIALLY_SHIPPED;
  if (count(SellerOrderStatus.PROCESSING) > 0) return OrderStatus.PROCESSING;
  return OrderStatus.NEW;
}
