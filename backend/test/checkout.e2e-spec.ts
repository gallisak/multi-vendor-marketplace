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

describe('Cart and multi-vendor checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sellerA: TestActor;
  let sellerB: TestActor;
  let admin: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  const createProduct = async (
    seller: TestActor,
    priceMinor: number,
    stock: number,
    overrides: { status?: ProductStatus; type?: ProductType } = {},
  ) =>
    prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Checkout ${uniqueSlug('p')}`,
        description: 'Checkout test product',
        priceMinor,
        stock,
        status: overrides.status ?? ProductStatus.ACTIVE,
        type: overrides.type ?? ProductType.FIXED_PRICE,
      },
    });

  const addToCart = (buyer: TestActor, productId: string, quantity: number) =>
    http().put(`/api/cart/items/${productId}`).set(bearer(buyer.token)).send({ quantity });

  const checkout = (buyer: TestActor, key: string = randomUUID(), body: object = {}) =>
    http()
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .set('Idempotency-Key', key)
      .send(body);

  const stockOf = async (productId: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    [sellerA, sellerB, admin] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.ADMIN),
    ]);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Checkout', slug: uniqueSlug('checkout') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('multi-vendor split', () => {
    it('creates one order with a seller order per seller and writes off stock everywhere', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const lamp = await createProduct(sellerA, 10_000, 5);
      const cable = await createProduct(sellerA, 3_333, 10);
      const chair = await createProduct(sellerB, 50_000, 2);

      await addToCart(buyer, lamp.id, 2).expect(200);
      await addToCart(buyer, cable.id, 3).expect(200);
      const cart = await addToCart(buyer, chair.id, 1).expect(200);

      expect(cart.body).toMatchObject({ totalMinor: 79_999, itemsCount: 6 });
      expect(cart.body.sellers).toHaveLength(2);

      const res = await checkout(buyer, randomUUID(), { expectedTotalMinor: 79_999 }).expect(201);

      expect(res.body).toMatchObject({
        status: 'NEW',
        paymentStatus: 'PENDING',
        totalMinor: 79_999,
      });
      expect(res.body).not.toHaveProperty('commissionMinor');
      const bySeller = Object.fromEntries(
        res.body.sellerOrders.map((so: { sellerId: string }) => [so.sellerId, so]),
      );
      expect(bySeller[sellerA.sellerId!]).toMatchObject({ subtotalMinor: 29_999, status: 'NEW' });
      expect(bySeller[sellerA.sellerId!].items).toHaveLength(2);
      expect(bySeller[sellerB.sellerId!]).toMatchObject({ subtotalMinor: 50_000 });

      expect(await stockOf(lamp.id)).toBe(3);
      expect(await stockOf(cable.id)).toBe(7);
      expect(await stockOf(chair.id)).toBe(1);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { sellerOrders: { include: { ledger: true } }, payment: true },
      });
      expect(order.commissionMinor).toBe(8_000n);
      expect(order.payment).toMatchObject({ status: 'PENDING', amountMinor: 79_999n });
      for (const sellerOrder of order.sellerOrders) {
        expect(sellerOrder.commissionRateBps).toBe(1000);
        expect(sellerOrder.commissionMinor).toBe(
          sellerOrder.sellerId === sellerA.sellerId ? 3_000n : 5_000n,
        );
        expect(
          sellerOrder.ledger
            .map((entry) => [entry.type, entry.amountMinor])
            .sort(([a], [b]) => String(a).localeCompare(String(b))),
        ).toEqual([
          ['COMMISSION', -sellerOrder.commissionMinor],
          ['SALE', sellerOrder.subtotalMinor],
        ]);
      }

      const emptied = await http().get('/api/cart').set(bearer(buyer.token)).expect(200);
      expect(emptied.body).toMatchObject({ sellers: [], totalMinor: 0, itemsCount: 0 });

      const events = await prisma.outboxEvent.findMany({ where: { aggregateId: res.body.id } });
      expect(events.map((e) => e.type)).toEqual(['order.placed']);
      expect(
        await prisma.outboxEvent.count({
          where: { aggregateId: { in: [lamp.id, cable.id, chair.id] }, type: 'product.changed' },
        }),
      ).toBe(3);
    });
  });

  describe('atomicity', () => {
    it('rolls back every write-off when one item is no longer available', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const fine = await createProduct(sellerA, 1_000, 5);
      const soldOut = await createProduct(sellerB, 2_000, 1);
      await addToCart(buyer, fine.id, 2).expect(200);
      await addToCart(buyer, soldOut.id, 1).expect(200);
      await prisma.product.update({ where: { id: soldOut.id }, data: { stock: 0 } });
      const key = randomUUID();

      const res = await checkout(buyer, key).expect(409);

      expect(res.body.message).toEqual([expect.stringContaining(`${soldOut.id}): OUT_OF_STOCK`)]);
      expect(await stockOf(fine.id)).toBe(5);
      expect(await prisma.order.count({ where: { buyerId: buyer.userId } })).toBe(0);

      const cart = await http().get('/api/cart').set(bearer(buyer.token)).expect(200);
      expect(cart.body.hasUnavailableItems).toBe(true);

      await http().delete(`/api/cart/items/${soldOut.id}`).set(bearer(buyer.token)).expect(200);
      await checkout(buyer, key).expect(201);
      expect(await stockOf(fine.id)).toBe(3);
    });

    it('rejects the checkout when prices changed since the buyer saw them', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 5_000, 3);
      await addToCart(buyer, product.id, 1).expect(200);
      await prisma.product.update({ where: { id: product.id }, data: { priceMinor: 6_000 } });

      const res = await checkout(buyer, randomUUID(), { expectedTotalMinor: 5_000 }).expect(409);

      expect(res.body.message).toMatch(/current total is 6000/);
      expect(await stockOf(product.id)).toBe(3);
    });

    it('never oversells when many buyers check out the last units at once', async () => {
      const product = await createProduct(sellerA, 1_500, 3);
      const buyers = await Promise.all(
        Array.from({ length: 6 }, () => createActor(app, prisma, Role.CUSTOMER)),
      );
      await Promise.all(buyers.map((buyer) => addToCart(buyer, product.id, 1).expect(200)));

      const results = await Promise.all(buyers.map((buyer) => checkout(buyer)));

      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409, 409, 409]);
      expect(await stockOf(product.id)).toBe(0);
      expect(await prisma.orderItem.count({ where: { productId: product.id } })).toBe(3);
    });
  });

  describe('idempotency', () => {
    it('returns the same order when the request is retried with the same key', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerB, 2_500, 4);
      await addToCart(buyer, product.id, 2).expect(200);
      const key = randomUUID();

      const first = await checkout(buyer, key).expect(201);
      const retry = await checkout(buyer, key).expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(await prisma.order.count({ where: { buyerId: buyer.userId } })).toBe(1);
      expect(await stockOf(product.id)).toBe(2);
    });

    it('creates a single order for concurrent requests with the same key', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 2_500, 10);
      await addToCart(buyer, product.id, 1).expect(200);
      const key = randomUUID();

      const results = await Promise.all([
        checkout(buyer, key),
        checkout(buyer, key),
        checkout(buyer, key),
      ]);

      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.order.count({ where: { buyerId: buyer.userId } })).toBe(1);
      expect(await stockOf(product.id)).toBe(9);
    });

    it('places the cart once when two checkouts with different keys race', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 2_500, 10);
      await addToCart(buyer, product.id, 2).expect(200);

      const results = await Promise.all([checkout(buyer), checkout(buyer)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(await prisma.order.count({ where: { buyerId: buyer.userId } })).toBe(1);
      expect(await stockOf(product.id)).toBe(8);
    });

    it('refuses to reuse a key for a different request', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 2_500, 10);
      await addToCart(buyer, product.id, 1).expect(200);
      const key = randomUUID();
      await checkout(buyer, key).expect(201);

      await checkout(buyer, key, { expectedTotalMinor: 1 }).expect(422);
    });

    it('requires a well-formed Idempotency-Key header', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);

      await http().post('/api/orders/checkout').set(bearer(buyer.token)).send({}).expect(400);
      await checkout(buyer, 'short').expect(400);
      await checkout(buyer, 'bad key with spaces').expect(400);
    });

    it('keys are scoped per user', async () => {
      const [alice, bob] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const product = await createProduct(sellerB, 1_000, 10);
      await addToCart(alice, product.id, 1).expect(200);
      await addToCart(bob, product.id, 1).expect(200);
      const key = randomUUID();

      const forAlice = await checkout(alice, key).expect(201);
      const forBob = await checkout(bob, key).expect(201);

      expect(forBob.body.id).not.toBe(forAlice.body.id);
    });
  });

  describe('cart rules', () => {
    it('validates what can be added', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const scarce = await createProduct(sellerA, 1_000, 2);
      const pending = await createProduct(sellerA, 1_000, 5, {
        status: ProductStatus.PENDING_MODERATION,
      });
      const lot = await createProduct(sellerA, 1_000, 1, { type: ProductType.AUCTION });

      await addToCart(buyer, scarce.id, 3)
        .expect(409)
        .expect(({ body }) => expect(body.message).toBe('Only 2 left in stock'));
      await addToCart(buyer, scarce.id, 0).expect(400);
      await addToCart(buyer, scarce.id, 100).expect(400);
      await addToCart(buyer, pending.id, 1).expect(404);
      await addToCart(buyer, lot.id, 1).expect(400);
      await addToCart(buyer, randomUUID(), 1).expect(404);
    });

    it('does not let sellers buy their own products', async () => {
      const own = await createProduct(sellerA, 1_000, 5);

      await addToCart(sellerA, own.id, 1)
        .expect(400)
        .expect(({ body }) => expect(body.message).toMatch(/own product/));
    });

    it('sets quantities idempotently and removes items', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerB, 1_000, 10);

      await addToCart(buyer, product.id, 2).expect(200);
      const same = await addToCart(buyer, product.id, 2).expect(200);
      expect(same.body.itemsCount).toBe(2);

      const removed = await http()
        .delete(`/api/cart/items/${product.id}`)
        .set(bearer(buyer.token))
        .expect(200);
      expect(removed.body.itemsCount).toBe(0);
    });

    it('flags items that were archived after being added', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerB, 1_000, 10);
      await addToCart(buyer, product.id, 1).expect(200);
      await prisma.product.update({
        where: { id: product.id },
        data: { status: ProductStatus.ARCHIVED },
      });

      const cart = await http().get('/api/cart').set(bearer(buyer.token)).expect(200);

      expect(cart.body.sellers[0].items[0]).toMatchObject({
        available: false,
        unavailableReason: 'ARCHIVED',
      });
      expect(cart.body.totalMinor).toBe(0);
      await checkout(buyer).expect(409);
    });

    it('rejects checkout of an empty cart and is closed to admins', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);

      await checkout(buyer)
        .expect(400)
        .expect(({ body }) => expect(body.message).toBe('Cart is empty'));
      await http().get('/api/cart').set(bearer(admin.token)).expect(403);
    });
  });

  describe('order access', () => {
    it('shows orders to their buyer only', async () => {
      const [owner, stranger] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const product = await createProduct(sellerA, 1_000, 5);
      await addToCart(owner, product.id, 1).expect(200);
      const order = await checkout(owner).expect(201);

      await http().get(`/api/orders/${order.body.id}`).set(bearer(owner.token)).expect(200);
      await http().get(`/api/orders/${order.body.id}`).set(bearer(stranger.token)).expect(404);

      const own = await http().get('/api/orders').set(bearer(owner.token)).expect(200);
      expect(own.body.items.map((o: { id: string }) => o.id)).toEqual([order.body.id]);
      const theirs = await http().get('/api/orders').set(bearer(stranger.token)).expect(200);
      expect(theirs.body.total).toBe(0);
    });
  });
});
