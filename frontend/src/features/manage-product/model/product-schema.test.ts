import type { SellerProduct } from '@/shared/api';
import { createProductSchema, editProductSchema, toCreatePayload, toPatch } from './product-schema';

const HOUR = 3600_000;
const inHours = (hours: number) => {
  const date = new Date(Date.now() + hours * HOUR);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const base = {
  title: 'Headphones',
  description: 'Wireless',
  categoryId: 'c1',
  imageUrls: 'https://img.test/1.png\n\n  https://img.test/2.png  ',
  price: '',
  stock: '',
  startPrice: '',
  bidStep: '',
  endsAt: '',
};

describe('product form schema', () => {
  it('builds a fixed price payload in minor units with cleaned image links', () => {
    const values = createProductSchema.parse({
      ...base,
      type: 'FIXED_PRICE',
      price: '1999,50',
      stock: '5',
    });
    expect(toCreatePayload(values)).toEqual({
      title: 'Headphones',
      description: 'Wireless',
      categoryId: 'c1',
      imageUrls: ['https://img.test/1.png', 'https://img.test/2.png'],
      type: 'FIXED_PRICE',
      priceMinor: 199_950,
      stock: 5,
    });
  });

  it('requires price and stock only for fixed price products', () => {
    const result = createProductSchema.safeParse({ ...base, type: 'FIXED_PRICE', stock: '1.5' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['price', 'stock']));
    expect(paths).not.toContain('startPrice');
  });

  it('keeps the auction window between 5 minutes and 30 days', () => {
    const auction = { ...base, type: 'AUCTION' as const, startPrice: '500', bidStep: '50' };
    expect(createProductSchema.safeParse({ ...auction, endsAt: inHours(24) }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...auction, endsAt: inHours(0.01) }).success).toBe(
      false,
    );
    expect(createProductSchema.safeParse({ ...auction, endsAt: inHours(24 * 31) }).success).toBe(
      false,
    );
  });

  it('builds an auction payload without price or stock', () => {
    const values = createProductSchema.parse({
      ...base,
      type: 'AUCTION',
      startPrice: '500',
      bidStep: '50.5',
      endsAt: inHours(2),
    });
    const payload = toCreatePayload(values);
    expect(payload).toMatchObject({
      type: 'AUCTION',
      auction: { startPriceMinor: 50_000, bidStepMinor: 5_050 },
    });
    expect(payload).not.toHaveProperty('priceMinor');
  });

  it('rejects links that are not http(s)', () => {
    const result = createProductSchema.safeParse({
      ...base,
      imageUrls: 'javascript:alert(1)',
      type: 'FIXED_PRICE',
      price: '10',
      stock: '1',
    });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('imageUrls');
  });

  it('sends only changed fields when editing', () => {
    const product = {
      title: 'Headphones',
      description: 'Wireless',
      category: { id: 'c1' },
      imageUrls: ['https://img.test/1.png'],
      type: 'FIXED_PRICE',
      priceMinor: 199_900,
    } as SellerProduct;
    const values = editProductSchema.parse({
      title: 'Headphones',
      description: 'Wireless, noise cancelling',
      categoryId: 'c1',
      imageUrls: 'https://img.test/1.png',
      price: '1899',
    });
    expect(toPatch(product, values)).toEqual({
      description: 'Wireless, noise cancelling',
      priceMinor: 189_900,
    });
  });
});
