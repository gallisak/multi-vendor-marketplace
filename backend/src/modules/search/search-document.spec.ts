import { Prisma } from '../../generated/prisma/client.js';
import { AuctionStatus, ProductStatus, ProductType } from '../../generated/prisma/enums.js';
import type { ProductWithRelations } from '../products/product.mapper.js';
import { buildFilter } from './meili-search-index.js';
import { ancestorIds, isSearchable, toSearchDocument } from './search-document.js';

const categories = [
  { id: 'electronics', name: 'Electronics', slug: 'electronics', parentId: null },
  { id: 'phones', name: 'Phones', slug: 'phones', parentId: 'electronics' },
  { id: 'android', name: 'Android', slug: 'android', parentId: 'phones' },
];

const product = (overrides: Partial<ProductWithRelations> = {}): ProductWithRelations =>
  ({
    id: 'p1',
    title: 'Pixel',
    description: 'Phone',
    type: ProductType.FIXED_PRICE,
    status: ProductStatus.ACTIVE,
    priceMinor: 100_00,
    stock: 3,
    imageUrls: ['https://img/1.png', 'https://img/2.png'],
    ratingAvg: new Prisma.Decimal('4.50'),
    ratingCount: 2,
    createdAt: new Date('2026-10-19T10:00:00Z'),
    category: { id: 'android', name: 'Android', slug: 'android' },
    seller: { id: 's1', storeName: 'Tech Store' },
    auction: null,
    ...overrides,
  }) as ProductWithRelations;

describe('ancestorIds', () => {
  it('walks from a leaf to the root', () => {
    expect(ancestorIds(categories, 'android')).toEqual(['android', 'phones', 'electronics']);
  });

  it('falls back to the id itself for an unknown category', () => {
    expect(ancestorIds(categories, 'missing')).toEqual(['missing']);
  });
});

describe('toSearchDocument', () => {
  it('denormalizes category ancestry, seller and availability', () => {
    expect(toSearchDocument(product(), categories)).toMatchObject({
      id: 'p1',
      categoryIds: ['android', 'phones', 'electronics'],
      categoryName: 'Android',
      sellerName: 'Tech Store',
      inStock: true,
      imageUrl: 'https://img/1.png',
      ratingAvg: 4.5,
      auctionEndsAt: null,
      createdAt: Date.parse('2026-10-19T10:00:00Z'),
    });
  });

  it('takes the display price from the product and exposes the current bid', () => {
    const endsAt = new Date('2026-10-20T10:00:00Z');
    const doc = toSearchDocument(
      product({
        type: ProductType.AUCTION,
        priceMinor: 750_00,
        auction: {
          currentPriceMinor: 750_00,
          endsAt,
          status: AuctionStatus.ACTIVE,
        } as ProductWithRelations['auction'],
      }),
      categories,
    );

    expect(doc).toMatchObject({
      priceMinor: 750_00,
      currentBidMinor: 750_00,
      auctionEndsAt: endsAt.getTime(),
    });
  });
});

describe('isSearchable', () => {
  it('indexes only active products of active sellers', () => {
    expect(isSearchable({ status: ProductStatus.ACTIVE }, true)).toBe(true);
    expect(isSearchable({ status: ProductStatus.ACTIVE }, false)).toBe(false);
    expect(isSearchable({ status: ProductStatus.PENDING_MODERATION }, true)).toBe(false);
    expect(isSearchable({ status: ProductStatus.ARCHIVED }, true)).toBe(false);
  });
});

describe('buildFilter', () => {
  it('translates filters into Meilisearch expressions', () => {
    expect(
      buildFilter({
        categoryId: 'phones',
        sellerId: 's1',
        minPrice: 100,
        maxPrice: 500,
        minRating: 4,
        inStock: true,
        sort: 'newest',
        page: 1,
        limit: 20,
      }),
    ).toEqual([
      'categoryIds = "phones"',
      'sellerId = "s1"',
      'priceMinor >= 100',
      'priceMinor <= 500',
      'ratingAvg >= 4',
      'inStock = true',
    ]);
  });

  it('strips quotes to prevent filter injection', () => {
    expect(
      buildFilter({ sellerId: 'x" OR sellerId != "', sort: 'newest', page: 1, limit: 20 }),
    ).toEqual(['sellerId = "x OR sellerId != "']);
  });
});
