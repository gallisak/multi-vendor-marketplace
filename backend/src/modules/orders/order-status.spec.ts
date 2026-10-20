import { OrderStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';
import { aggregateOrderStatus, CANCELLABLE_STATUSES, canTransition } from './order-status.js';

const { NEW, PROCESSING, SHIPPED, COMPLETED, CANCELLED } = SellerOrderStatus;

describe('aggregateOrderStatus', () => {
  it.each<[SellerOrderStatus[], OrderStatus]>([
    [[NEW], OrderStatus.NEW],
    [[NEW, NEW], OrderStatus.NEW],
    [[NEW, PROCESSING], OrderStatus.PROCESSING],
    [[PROCESSING, PROCESSING], OrderStatus.PROCESSING],
    [[SHIPPED, PROCESSING], OrderStatus.PARTIALLY_SHIPPED],
    [[SHIPPED, NEW], OrderStatus.PARTIALLY_SHIPPED],
    [[SHIPPED, SHIPPED], OrderStatus.SHIPPED],
    [[COMPLETED, SHIPPED], OrderStatus.PARTIALLY_COMPLETED],
    [[COMPLETED, NEW], OrderStatus.PARTIALLY_COMPLETED],
    [[COMPLETED, COMPLETED], OrderStatus.COMPLETED],
    [[CANCELLED], OrderStatus.CANCELLED],
    [[CANCELLED, CANCELLED], OrderStatus.CANCELLED],
  ])('%j -> %s', (statuses, expected) => {
    expect(aggregateOrderStatus(statuses)).toBe(expected);
  });

  it('ignores cancelled seller orders when the rest progressed', () => {
    expect(aggregateOrderStatus([CANCELLED, SHIPPED])).toBe(OrderStatus.SHIPPED);
    expect(aggregateOrderStatus([CANCELLED, COMPLETED])).toBe(OrderStatus.COMPLETED);
    expect(aggregateOrderStatus([CANCELLED, SHIPPED, NEW])).toBe(OrderStatus.PARTIALLY_SHIPPED);
  });

  it('does not depend on the order of seller orders', () => {
    expect(aggregateOrderStatus([PROCESSING, SHIPPED, COMPLETED])).toBe(
      aggregateOrderStatus([COMPLETED, PROCESSING, SHIPPED]),
    );
  });
});

describe('seller order transitions', () => {
  it.each<[SellerOrderStatus, SellerOrderStatus, boolean]>([
    [NEW, PROCESSING, true],
    [PROCESSING, SHIPPED, true],
    [SHIPPED, COMPLETED, true],
    [NEW, CANCELLED, true],
    [PROCESSING, CANCELLED, true],
    [NEW, SHIPPED, false],
    [SHIPPED, CANCELLED, false],
    [COMPLETED, CANCELLED, false],
    [CANCELLED, PROCESSING, false],
    [COMPLETED, PROCESSING, false],
  ])('%s -> %s allowed: %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('allows cancelling only before shipping', () => {
    expect(CANCELLABLE_STATUSES).toEqual([NEW, PROCESSING]);
  });
});
