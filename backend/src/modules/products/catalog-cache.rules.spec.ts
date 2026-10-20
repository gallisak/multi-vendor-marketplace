import {
  canonicalQuery,
  changeAffectsListing,
  listCacheKey,
  productCacheKey,
} from './catalog-cache.rules.js';

describe('catalog cache keys', () => {
  it('ignores parameter order and empty values', () => {
    expect(canonicalQuery({ sort: 'newest', page: 1, q: undefined, categoryId: '' })).toBe(
      canonicalQuery({ page: 1, sort: 'newest' }),
    );
  });

  it('separates different queries and generations', () => {
    const query = { page: 1, sort: 'newest' };

    expect(listCacheKey('0', '0', query)).toBe(listCacheKey('0', '0', { ...query }));
    expect(listCacheKey('0', '0', query)).not.toBe(listCacheKey('0', '0', { ...query, page: 2 }));
    expect(listCacheKey('0', '0', query)).not.toBe(listCacheKey('0', '1', query));
    expect(listCacheKey('0', '0', query)).not.toBe(listCacheKey('1', '0', query));
  });

  it('keys product pages by global and per-product generation', () => {
    expect(productCacheKey('2', '5', 'p-1')).toBe('catalog:2:product:p-1:5');
  });

  it('drops catalog pages only for changes that move products in or out of listings', () => {
    expect(changeAffectsListing('approved')).toBe(true);
    expect(changeAffectsListing('archived')).toBe(true);
    expect(changeAffectsListing('updated')).toBe(true);
    expect(changeAffectsListing('stock_changed')).toBe(false);
    expect(changeAffectsListing('bid_placed')).toBe(false);
  });
});
