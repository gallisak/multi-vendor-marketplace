import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  TestActor,
  uniqueSlug,
} from './helpers.js';

const HOUR = 60 * 60 * 1000;

describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestActor;
  let sellerA: TestActor;
  let sellerB: TestActor;
  let customer: TestActor;
  let rootCategoryId: string;
  let leafCategoryId: string;
  const http = () => request(app.getHttpServer());

  const fixedProduct = (overrides: Record<string, unknown> = {}) => ({
    title: `E2E phone ${uniqueSlug('p')}`,
    description: 'Test product',
    categoryId: leafCategoryId,
    type: 'FIXED_PRICE',
    priceMinor: 150_000,
    stock: 5,
    ...overrides,
  });

  const createProduct = (seller: TestActor, body: Record<string, unknown> = fixedProduct()) =>
    http().post('/api/seller/products').set(bearer(seller.token)).send(body);

  const approve = (productId: string) =>
    http().post(`/api/admin/products/${productId}/approve`).set(bearer(admin.token)).expect(200);

  const createActiveProduct = async (seller: TestActor, body = fixedProduct()) => {
    const created = await createProduct(seller, body).expect(201);
    await approve(created.body.id);
    return created.body as { id: string; title: string };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    [admin, sellerA, sellerB, customer] = await Promise.all([
      createActor(app, prisma, Role.ADMIN),
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.CUSTOMER),
    ]);
    const root = await prisma.category.create({
      data: { name: 'E2E Electronics', slug: uniqueSlug('root') },
    });
    const leaf = await prisma.category.create({
      data: { name: 'E2E Phones', slug: uniqueSlug('leaf'), parentId: root.id },
    });
    rootCategoryId = root.id;
    leafCategoryId = leaf.id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('pre-moderation', () => {
    it('publishes a product only after admin approval', async () => {
      const created = await createProduct(sellerA).expect(201);
      expect(created.body).toMatchObject({ status: 'PENDING_MODERATION', stock: 5 });

      await http().get(`/api/products/${created.body.id}`).expect(404);

      const queue = await http()
        .get('/api/admin/products?limit=100')
        .set(bearer(admin.token))
        .expect(200);
      expect(queue.body.items.map((p: { id: string }) => p.id)).toContain(created.body.id);

      await approve(created.body.id);
      await http()
        .get(`/api/products/${created.body.id}`)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            status: 'ACTIVE',
            seller: { id: sellerA.sellerId },
            category: { id: leafCategoryId },
          }),
        );
      expect((await http().get(`/api/products/${created.body.id}`)).body).not.toHaveProperty(
        'moderationNote',
      );
    });

    it('keeps rejected products hidden and resubmits them after an edit', async () => {
      const created = await createProduct(sellerA).expect(201);

      await http()
        .post(`/api/admin/products/${created.body.id}/reject`)
        .set(bearer(admin.token))
        .send({ note: 'Blurry photos' })
        .expect(200);
      await http()
        .post(`/api/admin/products/${created.body.id}/approve`)
        .set(bearer(admin.token))
        .expect(409);

      const own = await http()
        .get(`/api/seller/products/${created.body.id}`)
        .set(bearer(sellerA.token))
        .expect(200);
      expect(own.body).toMatchObject({ status: 'REJECTED', moderationNote: 'Blurry photos' });

      await http()
        .patch(`/api/seller/products/${created.body.id}`)
        .set(bearer(sellerA.token))
        .send({ description: 'Sharper photos now' })
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({ status: 'PENDING_MODERATION', moderationNote: null }),
        );
    });

    it('sends a live product back to moderation on content changes only', async () => {
      const product = await createActiveProduct(sellerA);

      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set(bearer(sellerA.token))
        .send({ priceMinor: 99_000 })
        .expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ status: 'ACTIVE', priceMinor: 99_000 }));

      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set(bearer(sellerA.token))
        .send({ title: 'Renamed phone' })
        .expect(200)
        .expect(({ body }) => expect(body.status).toBe('PENDING_MODERATION'));
    });
  });

  describe('ownership (IDOR)', () => {
    it("hides another seller's product from every seller endpoint", async () => {
      const product = await createActiveProduct(sellerA);
      const asB = bearer(sellerB.token);

      await http().get(`/api/seller/products/${product.id}`).set(asB).expect(404);
      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set(asB)
        .send({ title: 'Hijacked' })
        .expect(404);
      await http()
        .post(`/api/seller/products/${product.id}/stock-adjustments`)
        .set(asB)
        .send({ delta: -5 })
        .expect(404);
      await http().delete(`/api/seller/products/${product.id}`).set(asB).expect(404);

      const list = await http().get('/api/seller/products?limit=100').set(asB).expect(200);
      expect(list.body.items.map((p: { id: string }) => p.id)).not.toContain(product.id);

      const untouched = await http().get(`/api/products/${product.id}`).expect(200);
      expect(untouched.body).toMatchObject({ title: product.title, stock: 5, status: 'ACTIVE' });
    });

    it('lets only sellers manage products and only admins moderate', async () => {
      await createProduct(customer).expect(403);
      await createProduct(admin).expect(403);

      const created = await createProduct(sellerA).expect(201);
      await http()
        .post(`/api/admin/products/${created.body.id}/approve`)
        .set(bearer(sellerA.token))
        .expect(403);
    });

    it('cannot smuggle a foreign sellerId through the payload', async () => {
      await createProduct(sellerA, { ...fixedProduct(), sellerId: sellerB.sellerId }).expect(400);
    });
  });

  describe('auctions', () => {
    const auctionProduct = (auction: Record<string, unknown>, extra = {}) => ({
      title: `E2E lot ${uniqueSlug('a')}`,
      description: 'Rare item',
      categoryId: leafCategoryId,
      type: 'AUCTION',
      auction,
      ...extra,
    });
    const validAuction = () => ({
      startPriceMinor: 100_000,
      bidStepMinor: 5_000,
      endsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    });

    it('creates a single-unit lot priced from the auction', async () => {
      const created = await createProduct(sellerA, auctionProduct(validAuction())).expect(201);

      expect(created.body).toMatchObject({
        type: 'AUCTION',
        stock: 1,
        priceMinor: 100_000,
        auction: { startPriceMinor: 100_000, bidStepMinor: 5_000, status: 'ACTIVE', bidCount: 0 },
      });
    });

    it('validates auction settings', async () => {
      await createProduct(sellerA, {
        ...auctionProduct(validAuction()),
        auction: undefined,
      }).expect(400);
      await createProduct(
        sellerA,
        auctionProduct({ ...validAuction(), endsAt: new Date(Date.now() + 60_000).toISOString() }),
      ).expect(400);
      await createProduct(sellerA, auctionProduct(validAuction(), { priceMinor: 1 })).expect(400);
      await createProduct(sellerA, fixedProduct({ auction: validAuction() })).expect(400);
    });

    it('does not allow price edits or stock adjustments on auction lots', async () => {
      const created = await createProduct(sellerA, auctionProduct(validAuction())).expect(201);

      await http()
        .patch(`/api/seller/products/${created.body.id}`)
        .set(bearer(sellerA.token))
        .send({ priceMinor: 1 })
        .expect(400);
      await http()
        .post(`/api/seller/products/${created.body.id}/stock-adjustments`)
        .set(bearer(sellerA.token))
        .send({ delta: 3 })
        .expect(400);
    });

    it('refuses to archive an auction that already has bids', async () => {
      const created = await createProduct(sellerA, auctionProduct(validAuction())).expect(201);
      await prisma.auction.update({
        where: { productId: created.body.id },
        data: { bidCount: 1, currentPriceMinor: 100_000 },
      });

      await http()
        .delete(`/api/seller/products/${created.body.id}`)
        .set(bearer(sellerA.token))
        .expect(409);
    });
  });

  describe('stock', () => {
    it('applies atomic deltas and never goes below zero', async () => {
      const product = await createActiveProduct(sellerA, fixedProduct({ stock: 3 }));
      const adjust = (delta: number) =>
        http()
          .post(`/api/seller/products/${product.id}/stock-adjustments`)
          .set(bearer(sellerA.token))
          .send({ delta });

      const results = await Promise.all([-1, -1, -1, -1, -1].map(adjust));
      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);

      await adjust(4).expect(200);
      await adjust(-10).expect(409);
      await adjust(0).expect(400);

      const final = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(final.stock).toBe(4);
    });
  });

  describe('archiving', () => {
    it('hides an archived product and freezes it', async () => {
      const product = await createActiveProduct(sellerA);

      await http()
        .delete(`/api/seller/products/${product.id}`)
        .set(bearer(sellerA.token))
        .expect(204);
      await http()
        .delete(`/api/seller/products/${product.id}`)
        .set(bearer(sellerA.token))
        .expect(204);

      await http().get(`/api/products/${product.id}`).expect(404);
      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set(bearer(sellerA.token))
        .send({ title: 'Back from the dead' })
        .expect(409);
    });
  });

  describe('public catalog', () => {
    it('filters by category tree, text, price and stock and sorts by price', async () => {
      const tag = uniqueSlug('q');
      const cheap = await createActiveProduct(
        sellerB,
        fixedProduct({ title: `Cheap ${tag}`, priceMinor: 10_000 }),
      );
      const pricey = await createActiveProduct(
        sellerA,
        fixedProduct({ title: `Pricey ${tag}`, priceMinor: 90_000 }),
      );
      const soldOut = await createActiveProduct(
        sellerA,
        fixedProduct({ title: `Empty ${tag}`, priceMinor: 50_000, stock: 0 }),
      );

      const ids = async (query: string) => {
        const res = await http().get(`/api/products?${query}`).expect(200);
        return res.body.items.map((p: { id: string }) => p.id);
      };

      expect(await ids(`categoryId=${rootCategoryId}&q=${tag}&sort=price_asc`)).toEqual([
        cheap.id,
        soldOut.id,
        pricey.id,
      ]);
      expect(await ids(`q=${tag.toUpperCase()}&inStock=true&sort=price_desc`)).toEqual([
        pricey.id,
        cheap.id,
      ]);
      expect(await ids(`q=${tag}&minPrice=20000&maxPrice=60000`)).toEqual([soldOut.id]);
      expect(await ids(`q=${tag}&sellerId=${sellerB.sellerId}`)).toEqual([cheap.id]);
    });

    it('validates query parameters', async () => {
      await http().get('/api/products?limit=1000').expect(400);
      await http().get('/api/products?sort=random').expect(400);
      await http().get('/api/products?categoryId=not-a-uuid').expect(400);
      await http().get('/api/products?minPrice=5000&maxPrice=100').expect(400);
      await http().get('/api/products?page=501').expect(400);
    });
  });

  describe('similar products', () => {
    it('suggests listed products from the same category, best rated first', async () => {
      const shelf = await prisma.category.create({
        data: { name: 'E2E Shelf', slug: uniqueSlug('shelf') },
      });
      const inShelf = (title: string) => fixedProduct({ title, categoryId: shelf.id });
      const viewed = await createActiveProduct(sellerA, inShelf('Viewed lamp'));
      const good = await createActiveProduct(sellerB, inShelf('Good lamp'));
      const best = await createActiveProduct(sellerA, inShelf('Best lamp'));
      const plain = await createActiveProduct(sellerB, inShelf('Plain lamp'));
      await createProduct(sellerA, inShelf('Unmoderated lamp')).expect(201);
      await createActiveProduct(sellerA, fixedProduct({ title: 'Phone elsewhere' }));
      await prisma.product.update({
        where: { id: best.id },
        data: { ratingAvg: 4.9, ratingCount: 3 },
      });
      await prisma.product.update({
        where: { id: good.id },
        data: { ratingAvg: 4.1, ratingCount: 9 },
      });

      const res = await http().get(`/api/products/${viewed.id}/similar`).expect(200);
      expect(res.body.map((p: { id: string }) => p.id)).toEqual([best.id, good.id, plain.id]);

      const limited = await http().get(`/api/products/${viewed.id}/similar?limit=1`).expect(200);
      expect(limited.body.map((p: { id: string }) => p.id)).toEqual([best.id]);
    });

    it('does not suggest for hidden products and validates the limit', async () => {
      const hidden = await createProduct(sellerA).expect(201);

      await http().get(`/api/products/${hidden.body.id}/similar`).expect(404);
      await http().get(`/api/products/${randomUUID()}/similar`).expect(404);
      await http().get(`/api/products/${hidden.body.id}/similar?limit=50`).expect(400);
    });
  });
});
