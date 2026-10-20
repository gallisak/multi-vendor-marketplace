import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Redis } from 'ioredis';
import type { Counter } from 'prom-client';
import type { Env } from '../../infra/config/env.schema.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { CACHE_KEYS, listCacheKey, productCacheKey } from './catalog-cache.rules.js';

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export interface Cached<T> {
  value: T;
  cache: CacheStatus;
}

type CacheName = 'catalog_list' | 'product';

@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);
  private readonly ttlSeconds: number;
  private readonly listTtlSeconds: number;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectMetric(METRIC.cacheRequests) private readonly requests: Counter<string>,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get('CATALOG_CACHE_TTL_SECONDS', { infer: true });
    this.listTtlSeconds = Math.min(
      this.ttlSeconds,
      config.get('CATALOG_LIST_CACHE_TTL_SECONDS', { infer: true }),
    );
  }

  list<T>(query: object, load: () => Promise<T>): Promise<Cached<T>> {
    return this.cached(
      'catalog_list',
      [CACHE_KEYS.generation, CACHE_KEYS.listGeneration],
      ([generation, listGeneration]) => listCacheKey(generation, listGeneration, query),
      load,
      this.listTtlSeconds,
    );
  }

  product<T>(productId: string, load: () => Promise<T>): Promise<Cached<T>> {
    return this.cached(
      'product',
      [CACHE_KEYS.generation, CACHE_KEYS.productGeneration(productId)],
      ([generation, productGeneration]) =>
        productCacheKey(generation, productGeneration, productId),
      load,
      this.ttlSeconds,
    );
  }

  async invalidateProduct(productId: string, includeListings = true) {
    const generationKey = CACHE_KEYS.productGeneration(productId);
    const pipeline = this.redis
      .multi()
      .incr(generationKey)
      .expire(generationKey, this.ttlSeconds * 2 + 60);
    if (includeListings) {
      pipeline.incr(CACHE_KEYS.listGeneration);
    }
    await pipeline.exec();
  }

  async invalidateAll() {
    await this.redis.incr(CACHE_KEYS.generation);
  }

  private async cached<T>(
    name: CacheName,
    generationKeys: string[],
    keyFor: (generations: string[]) => string,
    load: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<Cached<T>> {
    let key: string;
    try {
      const generations = await this.redis.mget(...generationKeys);
      key = keyFor(generations.map((generation) => generation ?? '0'));
      const hit = await this.redis.get(key);
      if (hit !== null) {
        this.requests.inc({ cache: name, result: 'hit' });
        return { value: JSON.parse(hit) as T, cache: 'HIT' };
      }
    } catch (error) {
      this.requests.inc({ cache: name, result: 'error' });
      this.logger.warn({ err: error, cache: name }, 'Catalog cache unavailable, reading database');
      return { value: await load(), cache: 'BYPASS' };
    }

    this.requests.inc({ cache: name, result: 'miss' });
    return { value: await this.loadOnce(key, load, ttlSeconds), cache: 'MISS' };
  }

  private loadOnce<T>(key: string, load: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }
    const promise = load()
      .then(async (value) => {
        try {
          await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        } catch (error) {
          this.logger.warn({ err: error }, 'Could not store catalog cache entry');
        }
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}
