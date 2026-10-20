import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ProductStatus, Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  TestActor,
  uniqueSlug,
} from './helpers.js';

const WAIT = { timeout: 15_000, interval: 100 };

describe('Catalog cache (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: TestActor;
  let admin: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  const createProduct = (status: ProductStatus = ProductStatus.ACTIVE) =>
    prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Cached ${uniqueSlug('p')}`,
        description: 'Cache test product',
        priceMinor: 10_000,
        stock: 5,
        status,
      },
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    [seller, admin] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.ADMIN),
    ]);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Cache', slug: uniqueSlug('cache') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('serves product pages from cache and refreshes them after a change', async () => {
    const product = await createProduct();

    await http().get(`/api/products/${product.id}`).expect(200).expect('X-Cache', 'MISS');
    await http()
      .get(`/api/products/${product.id}`)
      .expect(200)
      .expect('X-Cache', 'HIT')
      .expect(({ body }) => expect(body.stock).toBe(5));

    await http()
      .post(`/api/seller/products/${product.id}/stock-adjustments`)
      .set(bearer(seller.token))
      .send({ delta: 7 })
      .expect(200);

    await vi.waitFor(async () => {
      const res = await http().get(`/api/products/${product.id}`).expect(200);
      expect(res.body.stock).toBe(12);
    }, WAIT);
    await http().get(`/api/products/${product.id}`).expect('X-Cache', 'HIT');
  });

  it('caches catalog pages per query and drops them when any product changes', async () => {
    const product = await createProduct();
    const page = `/api/products?sellerId=${seller.sellerId}&sort=newest`;
    const samePageReordered = `/api/products?sort=newest&sellerId=${seller.sellerId}&page=1`;

    const first = await http().get(page).expect(200).expect('X-Cache', 'MISS');
    await http().get(samePageReordered).expect(200).expect('X-Cache', 'HIT');
    await http().get(`${page}&inStock=true`).expect(200).expect('X-Cache', 'MISS');

    const fresh = await createProduct(ProductStatus.PENDING_MODERATION);
    await http()
      .post(`/api/admin/products/${fresh.id}/approve`)
      .set(bearer(admin.token))
      .expect(200);

    await vi.waitFor(async () => {
      const res = await http().get(page).expect(200);
      expect(res.body.total).toBe(first.body.total + 1);
      expect(res.body.items[0].id).toBe(fresh.id);
    }, WAIT);
    expect(first.body.items.map((p: { id: string }) => p.id)).toContain(product.id);
  });

  it('keeps catalog pages through stock changes while the product page refreshes', async () => {
    const product = await createProduct();
    const page = `/api/products?sellerId=${seller.sellerId}&sort=price_desc`;
    await http().get(page).expect(200);
    await http().get(`/api/products/${product.id}`).expect(200);

    await http()
      .post(`/api/seller/products/${product.id}/stock-adjustments`)
      .set(bearer(seller.token))
      .send({ delta: -2 })
      .expect(200);

    await vi.waitFor(async () => {
      const res = await http().get(`/api/products/${product.id}`).expect(200);
      expect(res.body.stock).toBe(3);
    }, WAIT);
    await http().get(page).expect(200).expect('X-Cache', 'HIT');
  });

  it('never caches missing products, so an approved product is visible at once', async () => {
    const product = await createProduct(ProductStatus.PENDING_MODERATION);

    await http().get(`/api/products/${product.id}`).expect(404);
    await http()
      .post(`/api/admin/products/${product.id}/approve`)
      .set(bearer(admin.token))
      .expect(200);

    await http().get(`/api/products/${product.id}`).expect(200).expect('X-Cache', 'MISS');
  });

  it('drops every cached page when a category changes', async () => {
    const product = await createProduct();
    await http().get(`/api/products/${product.id}`).expect(200);
    await http().get(`/api/products/${product.id}`).expect('X-Cache', 'HIT');

    await http()
      .patch(`/api/admin/categories/${categoryId}`)
      .set(bearer(admin.token))
      .send({ name: 'E2E Cache Renamed' })
      .expect(200);

    await vi.waitFor(async () => {
      const res = await http().get(`/api/products/${product.id}`).expect(200);
      expect(res.body.category.name).toBe('E2E Cache Renamed');
    }, WAIT);
  });

  it('coalesces concurrent misses into one database read', async () => {
    const product = await createProduct();
    const spy = vi.spyOn(prisma.product, 'findFirst');

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => http().get(`/api/products/${product.id}`).expect(200)),
    );

    const loads = spy.mock.calls.filter(
      ([args]) => (args as { where?: { id?: string } } | undefined)?.where?.id === product.id,
    );
    spy.mockRestore();
    expect(loads).toHaveLength(1);
    expect(new Set(responses.map((r) => r.body.id))).toEqual(new Set([product.id]));
  });

  it('exposes hit and miss counters', async () => {
    const metrics = await http().get('/metrics').expect(200);
    expect(metrics.text).toMatch(/cache_requests_total\{cache="product",result="hit"\} \d+/);
    expect(metrics.text).toMatch(/cache_requests_total\{cache="catalog_list",result="miss"\} \d+/);
  });
});
