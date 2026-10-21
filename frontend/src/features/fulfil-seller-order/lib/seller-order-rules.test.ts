import type { SellerOrder } from '@/shared/api';
import {
  canAccept,
  canRefund,
  canSellerCancel,
  canShip,
  refundableQuantity,
  restockIsOptional,
} from './seller-order-rules';

const item = {
  id: 'i1',
  productId: 'p1',
  title: 'Item',
  unitPriceMinor: 1000,
  lineTotalMinor: 3000,
};

const order = (overrides: Partial<SellerOrder> = {}): SellerOrder =>
  ({
    id: 's1',
    status: 'NEW',
    paymentStatus: 'CAPTURED',
    items: [{ ...item, quantity: 3, refundedQuantity: 0 }],
    ...overrides,
  }) as SellerOrder;

describe('seller order rules', () => {
  it('moves through accept and ship only from the right states', () => {
    expect(canAccept(order())).toBe(true);
    expect(canAccept(order({ paymentStatus: 'PENDING' }))).toBe(false);
    expect(canShip(order({ status: 'PROCESSING' }))).toBe(true);
    expect(canShip(order())).toBe(false);
  });

  it('lets the seller cancel before shipping only', () => {
    expect(canSellerCancel(order())).toBe(true);
    expect(canSellerCancel(order({ status: 'PROCESSING' }))).toBe(true);
    expect(canSellerCancel(order({ status: 'SHIPPED' }))).toBe(false);
  });

  it('refunds while some units are left and the order is not cancelled', () => {
    expect(canRefund(order({ status: 'SHIPPED' }))).toBe(true);
    expect(canRefund(order({ status: 'CANCELLED' }))).toBe(false);
    expect(canRefund(order({ items: [{ ...item, quantity: 3, refundedQuantity: 3 }] }))).toBe(
      false,
    );
    expect(refundableQuantity({ ...item, quantity: 3, refundedQuantity: 1 })).toBe(2);
  });

  it('asks about restocking only once the goods have left the warehouse', () => {
    expect(restockIsOptional(order({ status: 'PROCESSING' }))).toBe(false);
    expect(restockIsOptional(order({ status: 'SHIPPED' }))).toBe(true);
    expect(restockIsOptional(order({ status: 'COMPLETED' }))).toBe(true);
  });
});
