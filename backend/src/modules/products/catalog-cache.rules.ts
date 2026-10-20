import { createHash } from 'node:crypto';
import type { ProductChangeReason } from '../../common/events/domain-events.js';

export const CACHE_KEYS = {
  generation: 'catalog:gen',
  listGeneration: 'catalog:list-gen',
  productGeneration: (productId: string) => `catalog:product-gen:${productId}`,
};

export function canonicalQuery(query: object): string {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

export function listCacheKey(generation: string, listGeneration: string, query: object): string {
  const digest = createHash('sha1').update(canonicalQuery(query)).digest('base64url');
  return `catalog:${generation}:list:${listGeneration}:${digest}`;
}

export function productCacheKey(
  generation: string,
  productGeneration: string,
  productId: string,
): string {
  return `catalog:${generation}:product:${productId}:${productGeneration}`;
}

const PAGE_ONLY_REASONS: ProductChangeReason[] = ['stock_changed', 'bid_placed', 'reviewed'];

export function changeAffectsListing(reason: ProductChangeReason): boolean {
  return !PAGE_ONLY_REASONS.includes(reason);
}
