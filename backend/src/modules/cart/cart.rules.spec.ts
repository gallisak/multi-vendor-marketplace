import { ProductStatus, ProductType } from '../../generated/prisma/enums.js';
import { PurchasableProduct, unavailableReason } from './cart.rules.js';

const product = (overrides: Partial<PurchasableProduct> = {}): PurchasableProduct => ({
  status: ProductStatus.ACTIVE,
  type: ProductType.FIXED_PRICE,
  stock: 5,
  seller: { isActive: true, userId: 'seller-user' },
  ...overrides,
});

describe('unavailableReason', () => {
  it('accepts an active fixed price product with enough stock', () => {
    expect(unavailableReason(product(), 5, 'buyer')).toBeNull();
  });

  it.each<[string, Partial<PurchasableProduct>, number, string]>([
    ['archived', { status: ProductStatus.ARCHIVED }, 1, 'ARCHIVED'],
    ['pending moderation', { status: ProductStatus.PENDING_MODERATION }, 1, 'NOT_ACTIVE'],
    ['seller deactivated', { seller: { isActive: false, userId: 'x' } }, 1, 'SELLER_INACTIVE'],
    ['auction lot', { type: ProductType.AUCTION }, 1, 'AUCTION'],
    ['sold out', { stock: 0 }, 1, 'OUT_OF_STOCK'],
    ['not enough stock', { stock: 2 }, 3, 'INSUFFICIENT_STOCK'],
  ])('rejects a product that is %s', (_case, overrides, quantity, reason) => {
    expect(unavailableReason(product(overrides), quantity, 'buyer')).toBe(reason);
  });

  it('does not let sellers buy their own products', () => {
    expect(unavailableReason(product(), 1, 'seller-user')).toBe('OWN_PRODUCT');
  });

  it('reports archiving before stock problems', () => {
    expect(unavailableReason(product({ status: ProductStatus.ARCHIVED, stock: 0 }), 1, 'b')).toBe(
      'ARCHIVED',
    );
  });
});
