import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

describe('Reviews and disputes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: TestActor;
  let admin: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  const createProduct = (priceMinor = 10_000, stock = 50) =>
    prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Reviewed ${uniqueSlug('p')}`,
        description: 'Review test product',
        priceMinor,
        stock,
        status: ProductStatus.ACTIVE,
      },
    });

  const placeOrder = async (buyer: TestActor, productId: string, quantity = 1) => {
    await http()
      .put(`/api/cart/items/${productId}`)
      .set(bearer(buyer.token))
      .send({ quantity })
      .expect(200);
    const res = await http()
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const orderId = res.body.id as string;
    const sellerOrder = res.body.sellerOrders[0] as { id: string; items: { id: string }[] };
    await vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.paymentStatus).toBe('CAPTURED');
    }, WAIT);
    return { orderId, sellerOrderId: sellerOrder.id, itemId: sellerOrder.items[0].id };
  };

  const ship = async (sellerOrderId: string) => {
    await http()
      .post(`/api/seller/orders/${sellerOrderId}/accept`)
      .set(bearer(seller.token))
      .expect(200);
    await http()
      .post(`/api/seller/orders/${sellerOrderId}/ship`)
      .set(bearer(seller.token))
      .expect(200);
  };

  const deliver = async (buyer: TestActor, productId: string, quantity = 1) => {
    const order = await placeOrder(buyer, productId, quantity);
    await ship(order.sellerOrderId);
    await http()
      .post(`/api/orders/${order.orderId}/seller-orders/${order.sellerOrderId}/confirm-delivery`)
      .set(bearer(buyer.token))
      .expect(200);
    return order;
  };

  const review = (author: TestActor, productId: string, rating: number, comment?: string) =>
    http()
      .post(`/api/products/${productId}/reviews`)
      .set(bearer(author.token))
      .send({ rating, comment });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    [seller, admin] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.ADMIN),
    ]);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Reviews', slug: uniqueSlug('review') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('reviews', () => {
    it('accepts reviews only from buyers who received the product', async () => {
      const [stranger, waiting, alice, bob] = await Promise.all(
        Array.from({ length: 4 }, () => createActor(app, prisma, Role.CUSTOMER)),
      );
      const product = await createProduct();

      await review(stranger, product.id, 5).expect(403);
      const pending = await placeOrder(waiting, product.id);
      await ship(pending.sellerOrderId);
      await review(waiting, product.id, 5)
        .expect(403)
        .expect(({ body }) =>
          expect(body.message).toBe('Only buyers who received this product can review it'),
        );

      await deliver(alice, product.id);
      const first = await review(alice, product.id, 5, 'Great lamp').expect(201);
      expect(first.body).toMatchObject({ rating: 5, ratingAvg: 5, ratingCount: 1, author: 'E***' });
      await review(alice, product.id, 4).expect(409);

      await deliver(bob, product.id);
      const second = await review(bob, product.id, 2).expect(201);
      expect(second.body).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });

      const page = await http().get(`/api/products/${product.id}/reviews`).expect(200);
      expect(page.body).toMatchObject({ total: 2, ratingAvg: 3.5, ratingCount: 2 });
      const productView = await http().get(`/api/products/${product.id}`).expect(200);
      expect(productView.body).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });
      const sellerRow = await prisma.seller.findUniqueOrThrow({ where: { id: seller.sellerId } });
      expect(sellerRow.ratingCount).toBeGreaterThanOrEqual(2);

      await review(alice, product.id, 6).expect(400);
    });

    it('keeps the average exact when buyers review at the same time', async () => {
      const buyers = await Promise.all(
        Array.from({ length: 5 }, () => createActor(app, prisma, Role.CUSTOMER)),
      );
      const product = await createProduct();
      for (const buyer of buyers) {
        await deliver(buyer, product.id);
      }

      const ratings = [5, 4, 4, 2, 1];
      const results = await Promise.all(
        buyers.map((buyer, i) => review(buyer, product.id, ratings[i])),
      );

      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.ratingCount).toBe(5);
      expect(stored.ratingAvg.toNumber()).toBe(3.2);
    });

    it('does not let a fully refunded purchase count as a confirmed buy', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct();
      const order = await deliver(buyer, product.id);
      await http()
        .post(`/api/seller/orders/${order.sellerOrderId}/refunds`)
        .set(bearer(seller.token))
        .set('Idempotency-Key', randomUUID())
        .send({ orderItemId: order.itemId, quantity: 1 })
        .expect(201);

      await review(buyer, product.id, 1).expect(403);
    });
  });

  describe('disputes', () => {
    const open = (buyer: TestActor, order: { orderId: string; sellerOrderId: string }) =>
      http()
        .post(`/api/orders/${order.orderId}/seller-orders/${order.sellerOrderId}/disputes`)
        .set(bearer(buyer.token))
        .send({ reason: 'The item arrived broken, seller is silent' });

    const resolve = (disputeId: string, decision: string) =>
      http()
        .post(`/api/admin/disputes/${disputeId}/resolve`)
        .set(bearer(admin.token))
        .send({ decision, note: 'Checked the photos' });

    it('resolves for the buyer by refunding everything left and closing the seller order', async () => {
      const [buyer, stranger] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const product = await createProduct(10_000);
      const order = await placeOrder(buyer, product.id, 3);

      await open(buyer, order)
        .expect(409)
        .expect(({ body }) => expect(body.message).toMatch(/after the order was shipped/));
      await ship(order.sellerOrderId);
      await http()
        .post(`/api/seller/orders/${order.sellerOrderId}/refunds`)
        .set(bearer(seller.token))
        .set('Idempotency-Key', randomUUID())
        .send({ orderItemId: order.itemId, quantity: 1 })
        .expect(201);

      const dispute = await open(buyer, order).expect(201);
      expect(dispute.body).toMatchObject({
        status: 'OPEN',
        orderId: order.orderId,
        sellerOrderStatus: 'SHIPPED',
        storeName: expect.any(String),
        subtotalMinor: expect.any(Number),
        refundedMinor: expect.any(Number),
      });
      expect(dispute.body.refundedMinor).toBeGreaterThan(0);
      await open(buyer, order).expect(409);
      await open(stranger, order).expect(404);

      const sellerList = await http()
        .get('/api/seller/disputes?limit=100')
        .set(bearer(seller.token));
      expect(sellerList.body.items.map((d: { id: string }) => d.id)).toContain(dispute.body.id);
      await http().get('/api/admin/disputes').set(bearer(buyer.token)).expect(403);

      const resolved = await resolve(dispute.body.id, 'BUYER').expect(200);
      expect(resolved.body).toMatchObject({
        status: 'RESOLVED_FOR_BUYER',
        resolutionNote: 'Checked the photos',
      });
      await resolve(dispute.body.id, 'SELLER').expect(409);

      const sellerOrder = await prisma.sellerOrder.findUniqueOrThrow({
        where: { id: order.sellerOrderId },
        include: { ledger: true, items: true, order: true },
      });
      expect(sellerOrder.status).toBe('COMPLETED');
      expect(sellerOrder.refundedMinor).toBe(30_000n);
      expect(sellerOrder.items[0].refundedQuantity).toBe(3);
      expect(sellerOrder.order.paymentStatus).toBe('REFUNDED');
      expect(sellerOrder.ledger.reduce((sum, e) => sum + e.amountMinor, 0n)).toBe(0n);

      await vi.waitFor(async () => {
        const forBuyer = await prisma.notification.count({
          where: { userId: buyer.userId, type: 'dispute.resolved' },
        });
        const forSeller = await prisma.notification.count({
          where: { userId: seller.userId, type: { in: ['dispute.opened', 'dispute.resolved'] } },
        });
        expect(forBuyer).toBe(1);
        expect(forSeller).toBeGreaterThanOrEqual(2);
      }, WAIT);
    });

    it('resolves for the seller without moving money', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(7_000);
      const order = await placeOrder(buyer, product.id, 1);
      await ship(order.sellerOrderId);
      const dispute = await open(buyer, order).expect(201);

      await resolve(dispute.body.id, 'SELLER')
        .expect(200)
        .expect(({ body }) => expect(body.status).toBe('RESOLVED_FOR_SELLER'));

      const sellerOrder = await prisma.sellerOrder.findUniqueOrThrow({
        where: { id: order.sellerOrderId },
        include: { order: true },
      });
      expect(sellerOrder).toMatchObject({ status: 'COMPLETED', refundedMinor: 0n });
      expect(sellerOrder.order.paymentStatus).toBe('CAPTURED');
    });

    it('does not reopen a decided dispute or dispute a fully refunded seller order', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(6_000);
      const decided = await placeOrder(buyer, product.id, 1);
      await ship(decided.sellerOrderId);
      const dispute = await open(buyer, decided).expect(201);
      await resolve(dispute.body.id, 'SELLER').expect(200);

      await open(buyer, decided)
        .expect(409)
        .expect(({ body }) => expect(body.message).toMatch(/already decided/));

      const refunded = await placeOrder(buyer, product.id, 1);
      await ship(refunded.sellerOrderId);
      await http()
        .post(`/api/seller/orders/${refunded.sellerOrderId}/refunds`)
        .set(bearer(seller.token))
        .set('Idempotency-Key', randomUUID())
        .send({ orderItemId: refunded.itemId, quantity: 1 })
        .expect(201);
      await open(buyer, refunded).expect(409);
    });

    it('lets the buyer withdraw an open dispute', async () => {
      const [buyer, stranger] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const product = await createProduct(5_000);
      const order = await placeOrder(buyer, product.id, 1);
      await ship(order.sellerOrderId);
      const dispute = await open(buyer, order).expect(201);

      await http()
        .post(`/api/disputes/${dispute.body.id}/withdraw`)
        .set(bearer(stranger.token))
        .expect(404);
      await http()
        .post(`/api/disputes/${dispute.body.id}/withdraw`)
        .set(bearer(buyer.token))
        .expect(200)
        .expect(({ body }) => expect(body.status).toBe('CLOSED'));
      await http()
        .post(`/api/disputes/${dispute.body.id}/withdraw`)
        .set(bearer(buyer.token))
        .expect(409);
      await resolve(dispute.body.id, 'BUYER').expect(409);
      await open(buyer, order).expect(201);
    });
  });
});
