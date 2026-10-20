import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ProductStatus, ProductType, Role } from '../src/generated/prisma/enums.js';
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

describe('Analytics and seller dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestActor;
  let sellerA: TestActor;
  let sellerB: TestActor;
  let lampId: string;
  let chairId: string;
  const http = () => request(app.getHttpServer());

  const addToCart = (buyer: TestActor, productId: string, quantity: number) =>
    http()
      .put(`/api/cart/items/${productId}`)
      .set(bearer(buyer.token))
      .send({ quantity })
      .expect(200);

  const checkout = async (buyer: TestActor) => {
    const res = await http()
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    await vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(order.paymentStatus).toBe('CAPTURED');
    }, WAIT);
    return res.body as { id: string; sellerOrders: { id: string; sellerId: string }[] };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    [admin, sellerA, sellerB] = await Promise.all([
      createActor(app, prisma, Role.ADMIN),
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.SELLER),
    ]);
    const categoryId = (
      await prisma.category.create({ data: { name: 'E2E Analytics', slug: uniqueSlug('stats') } })
    ).id;
    const product = (sellerId: string, title: string, priceMinor: number) =>
      prisma.product.create({
        data: {
          sellerId,
          categoryId,
          title,
          description: 'Analytics product',
          priceMinor,
          stock: 20,
          status: ProductStatus.ACTIVE,
        },
      });
    lampId = (await product(sellerA.sellerId!, 'Analytics lamp, "deluxe"', 10_000)).id;
    chairId = (await product(sellerB.sellerId!, 'Analytics chair', 50_000)).id;
    await prisma.product.create({
      data: {
        sellerId: sellerA.sellerId!,
        categoryId,
        title: 'Analytics lot',
        description: 'Lot',
        type: ProductType.AUCTION,
        priceMinor: 30_000,
        stock: 1,
        status: ProductStatus.ACTIVE,
        auction: {
          create: {
            startPriceMinor: 30_000,
            bidStepMinor: 1_000,
            endsAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });

    const [first, second, browser, declined] = await Promise.all(
      Array.from({ length: 4 }, () => createActor(app, prisma, Role.CUSTOMER)),
    );
    await addToCart(first, lampId, 2);
    await addToCart(first, chairId, 1);
    await checkout(first);

    await addToCart(second, lampId, 1);
    const cancelled = await checkout(second);
    await http()
      .post(`/api/seller/orders/${cancelled.sellerOrders[0].id}/cancel`)
      .set(bearer(sellerA.token))
      .send({ reason: 'Damaged in the warehouse' })
      .expect(200);

    await addToCart(browser, chairId, 1);

    const diamondId = (await product(sellerA.sellerId!, 'Analytics diamond', 5_000_000)).id;
    await addToCart(declined, diamondId, 1);
    const failed = await http()
      .post('/api/orders/checkout')
      .set(bearer(declined.token))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    await vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: failed.body.id } });
      expect(order.paymentStatus).toBe('FAILED');
    }, WAIT);

    await vi.waitFor(async () => {
      const rows = await prisma.salesDaily.findMany({ where: { productId: lampId } });
      expect(rows.map((row) => [row.unitsSold, row.refundedMinor])).toEqual([[3, 10_000n]]);
    }, WAIT);
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('reports commission and revenue per seller from paid orders in the ledger', async () => {
    const res = await http()
      .get('/api/admin/analytics/summary')
      .set(bearer(admin.token))
      .expect(200);

    expect(res.body).toMatchObject({
      platformCommissionMinor: 7_000,
      grossSalesMinor: 80_000,
      refundedMinor: 10_000,
      ordersCount: 2,
    });
    const bySeller = Object.fromEntries(
      res.body.sellers.map((s: { sellerId: string }) => [s.sellerId, s]),
    );
    expect(bySeller[sellerA.sellerId!]).toMatchObject({
      grossMinor: 30_000,
      refundedMinor: 10_000,
      commissionMinor: 2_000,
      payoutMinor: 18_000,
    });
    expect(bySeller[sellerB.sellerId!]).toMatchObject({
      commissionMinor: 5_000,
      payoutMinor: 45_000,
    });
  });

  it('ranks top products and sellers from the sales read model', async () => {
    const res = await http()
      .get('/api/admin/analytics/summary')
      .set(bearer(admin.token))
      .expect(200);

    expect(
      res.body.topProducts.map((p: { productId: string; netMinor: number }) => [
        p.productId,
        p.netMinor,
      ]),
    ).toEqual([
      [chairId, 50_000],
      [lampId, 20_000],
    ]);
    expect(res.body.topProducts[1].unitsSold).toBe(3);
    expect(
      res.body.topSellers.map((s: { sellerId: string; ordersCount: number }) => [
        s.sellerId,
        s.ordersCount,
      ]),
    ).toEqual([
      [sellerB.sellerId, 1],
      [sellerA.sellerId, 2],
    ]);
  });

  it('measures cart to order conversion', async () => {
    const res = await http()
      .get('/api/admin/analytics/summary')
      .set(bearer(admin.token))
      .expect(200);

    expect(res.body.conversion).toEqual({ cartUsers: 4, buyers: 2, ratePercent: 50 });
  });

  it('builds a 30 day sales chart compared with the previous period', async () => {
    const res = await http()
      .get('/api/admin/analytics/sales-chart')
      .set(bearer(admin.token))
      .expect(200);

    expect(res.body.current).toHaveLength(30);
    expect(res.body.previous).toHaveLength(30);
    expect(res.body.current.at(-1)).toMatchObject({
      grossMinor: 80_000,
      refundedMinor: 10_000,
      ordersCount: 2,
    });
    expect(res.body.totals).toEqual({
      currentNetMinor: 70_000,
      previousNetMinor: 0,
      changePercent: null,
    });
  });

  it('exports the report as CSV and importable JSON', async () => {
    const csv = await http()
      .get('/api/admin/analytics/export?format=csv')
      .set(bearer(admin.token))
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'day,sellerId,storeName,productId,title,ordersCount,unitsSold,grossMinor,refundedMinor,commissionMinor',
    );
    expect(lines).toHaveLength(3);
    expect(csv.text).toContain('"Analytics lamp, ""deluxe"""');
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="sales-.*\.csv"/);

    const json = await http()
      .get('/api/admin/analytics/export?format=json')
      .set(bearer(admin.token))
      .expect(200);
    expect(json.body.columns).toHaveLength(10);
    const lamp = json.body.rows.find((row: { productId: string }) => row.productId === lampId);
    expect(lamp).toMatchObject({
      ordersCount: 2,
      unitsSold: 3,
      grossMinor: 30_000,
      refundedMinor: 10_000,
    });
  });

  it('validates periods and is closed to non-admins', async () => {
    await http()
      .get('/api/admin/analytics/summary?from=2026-10-20&to=2026-10-01')
      .set(bearer(admin.token))
      .expect(400);
    await http()
      .get('/api/admin/analytics/summary?from=yesterday')
      .set(bearer(admin.token))
      .expect(400);
    await http().get('/api/admin/analytics/summary').set(bearer(sellerA.token)).expect(403);
  });

  it('gives the seller a dashboard of their own revenue, orders and auctions', async () => {
    const res = await http().get('/api/seller/dashboard').set(bearer(sellerA.token)).expect(200);

    expect(res.body.revenue.last30Days).toEqual({
      grossMinor: 30_000,
      refundedMinor: 10_000,
      commissionMinor: 2_000,
      payoutMinor: 18_000,
    });
    expect(res.body.revenue.allTime.payoutMinor).toBe(18_000);
    expect(res.body.sellerOrders).toEqual({ NEW: 1, CANCELLED: 2 });
    expect(res.body.auctions).toEqual([
      expect.objectContaining({
        title: 'Analytics lot',
        status: 'ACTIVE',
        minNextBidMinor: 30_000,
      }),
    ]);
    expect(res.body.recentOrders).toHaveLength(3);

    const other = await http().get('/api/seller/dashboard').set(bearer(sellerB.token)).expect(200);
    expect(other.body.revenue.allTime.payoutMinor).toBe(45_000);
    expect(other.body.auctions).toEqual([]);
  });
});
