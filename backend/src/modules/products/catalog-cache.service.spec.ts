import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Counter } from 'prom-client';
import type { Env } from '../../infra/config/env.schema.js';
import { CatalogCacheService } from './catalog-cache.service.js';

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map((k) => store.get(k) ?? null))),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    incr: vi.fn((key: string) => {
      store.set(key, String(Number(store.get(key) ?? 0) + 1));
      return Promise.resolve(Number(store.get(key)));
    }),
    expire: vi.fn(),
    multi() {
      const ops: string[] = [];
      const chain = {
        incr: (key: string) => {
          ops.push(key);
          return chain;
        },
        expire: (key: string, seconds: number) => {
          this.expire(key, seconds);
          return chain;
        },
        exec: async () => {
          for (const key of ops) await this.incr(key);
          return [];
        },
      };
      return chain;
    },
  };
}

const setup = (redis: object) => {
  const counter = { inc: vi.fn() };
  const config = {
    get: (key: string) => (key === 'CATALOG_LIST_CACHE_TTL_SECONDS' ? 10 : 60),
  } as unknown as ConfigService<Env, true>;
  return {
    counter,
    cache: new CatalogCacheService(redis as Redis, counter as unknown as Counter<string>, config),
  };
};

describe('CatalogCacheService', () => {
  it('stores a miss and serves the next read from cache', async () => {
    const redis = fakeRedis();
    const { cache, counter } = setup(redis);
    const load = vi.fn().mockResolvedValue({ id: 'p-1', stock: 3 });

    expect(await cache.product('p-1', load)).toEqual({
      value: { id: 'p-1', stock: 3 },
      cache: 'MISS',
    });
    expect(await cache.product('p-1', load)).toMatchObject({ cache: 'HIT' });
    expect(load).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 60);
    expect(counter.inc).toHaveBeenCalledWith({ cache: 'product', result: 'hit' });
  });

  it('reloads a product after invalidation without touching other products', async () => {
    const { cache } = setup(fakeRedis());
    const load = vi.fn().mockResolvedValue({});
    await cache.product('p-1', load);
    await cache.product('p-2', load);

    await cache.invalidateProduct('p-1');

    expect(await cache.product('p-1', load)).toMatchObject({ cache: 'MISS' });
    expect(await cache.product('p-2', load)).toMatchObject({ cache: 'HIT' });
  });

  it('drops catalog pages on any product change and everything on invalidateAll', async () => {
    const { cache } = setup(fakeRedis());
    const load = vi.fn().mockResolvedValue({ items: [] });
    await cache.list({ page: 1 }, load);
    await cache.product('p-9', load);

    await cache.invalidateProduct('p-1');
    expect(await cache.list({ page: 1 }, load)).toMatchObject({ cache: 'MISS' });
    expect(await cache.product('p-9', load)).toMatchObject({ cache: 'HIT' });

    await cache.invalidateAll();
    expect(await cache.product('p-9', load)).toMatchObject({ cache: 'MISS' });
  });

  it('keeps catalog pages for page-only changes and lets them expire sooner', async () => {
    const redis = fakeRedis();
    const { cache } = setup(redis);
    const load = vi.fn().mockResolvedValue({ items: [] });
    await cache.list({ page: 1 }, load);
    await cache.product('p-1', load);

    await cache.invalidateProduct('p-1', false);

    expect(await cache.list({ page: 1 }, load)).toMatchObject({ cache: 'HIT' });
    expect(await cache.product('p-1', load)).toMatchObject({ cache: 'MISS' });
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(':list:'),
      expect.any(String),
      'EX',
      10,
    );
    expect(redis.expire).toHaveBeenCalledWith('catalog:product-gen:p-1', 180);
  });

  it('runs one load for concurrent misses on the same key', async () => {
    const { cache } = setup(fakeRedis());
    let release!: (value: object) => void;
    const load = vi.fn(() => new Promise<object>((resolve) => (release = resolve)));

    const reads = [cache.product('p-1', load), cache.product('p-1', load)];
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    release({ id: 'p-1' });

    expect(await Promise.all(reads)).toEqual([
      { value: { id: 'p-1' }, cache: 'MISS' },
      { value: { id: 'p-1' }, cache: 'MISS' },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const { cache } = setup(fakeRedis());
    const load = vi.fn().mockRejectedValueOnce(new Error('not found')).mockResolvedValue({});

    await expect(cache.product('p-1', load)).rejects.toThrow('not found');
    expect(await cache.product('p-1', load)).toMatchObject({ cache: 'MISS' });
  });

  it('falls back to the database when Redis is down', async () => {
    const down = { mget: vi.fn().mockRejectedValue(new Error('Connection is closed')) };
    const { cache, counter } = setup(down);

    expect(await cache.product('p-1', () => Promise.resolve({ id: 'p-1' }))).toEqual({
      value: { id: 'p-1' },
      cache: 'BYPASS',
    });
    expect(counter.inc).toHaveBeenCalledWith({ cache: 'product', result: 'error' });
  });
});
