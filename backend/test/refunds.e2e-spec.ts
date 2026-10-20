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

describe('Cancellations and partial refunds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sellerA: TestActor;
  let sellerB: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  const createProduct = (seller: TestActor, priceMinor: number, stock = 10) =>
    prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Refund ${uniqueSlug('p')}`,
        description: 'Refund test product',
        priceMinor,
        stock,
        status: ProductStatus.ACTIVE,
      },
    });

  const placePaidOrder = async (
    buyer: TestActor,
    lines: { productId: string; quantity: number }[],
  ) => {
    for (const line of lines) {
      await http()
        .put(`/api/cart/items/${line.productId}`)
        .set(bearer(buyer.token))
        .send({ quantity: line.quantity })
        .expect(200);
    }
    const res = await http()
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const orderId = res.body.id as string;
    await vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.paymentStatus).toBe('CAPTURED');
    }, WAIT);
    const sellerOrders = res.body.sellerOrders as {
      id: string;
      sellerId: string;
      items: { id: string; productId: string }[];
    }[];
    const of = (seller: TestActor) => sellerOrders.find((so) => so.sellerId === seller.sellerId)!;
    return { orderId, of };
  };

  const stockOf = async (productId: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  const ledgerBalance = async (sellerOrderId: string) =>
    (await prisma.ledgerEntry.findMany({ where: { sellerOrderId } })).reduce(
      (sum, entry) => sum + entry.amountMinor,
      0n,
    );

  const seller = (actor: TestActor, sellerOrderId: string, action: string) =>
    http().post(`/api/seller/orders/${sellerOrderId}/${action}`).set(bearer(actor.token));

  const refund = (actor: TestActor, sellerOrderId: string, body: object, key = randomUUID()) =>
    http()
      .post(`/api/seller/orders/${sellerOrderId}/refunds`)
      .set(bearer(actor.token))
      .set('Idempotency-Key', key)
      .send(body);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    [sellerA, sellerB] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.SELLER),
    ]);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Refunds', slug: uniqueSlug('refund') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('cancelling one seller order', () => {
    it('leaves the other seller untouched, returns stock and refunds the buyer', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const [missing, fine] = await Promise.all([
        createProduct(sellerA, 10_000, 5),
        createProduct(sellerB, 20_000, 5),
      ]);
      const { orderId, of } = await placePaidOrder(buyer, [
        { productId: missing.id, quantity: 2 },
        { productId: fine.id, quantity: 1 },
      ]);

      const cancelled = await seller(sellerA, of(sellerA).id, 'cancel')
        .send({ reason: 'Item turned out to be out of stock' })
        .expect(200);

      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Item turned out to be out of stock',
        refundedMinor: 20_000,
        payoutMinor: 0,
        paymentStatus: 'PARTIALLY_REFUNDED',
      });
      expect(await stockOf(missing.id)).toBe(5);
      expect(await stockOf(fine.id)).toBe(4);
      expect(await ledgerBalance(of(sellerA).id)).toBe(0n);
      expect(await ledgerBalance(of(sellerB).id)).toBe(18_000n);

      const order = await http().get(`/api/orders/${orderId}`).set(bearer(buyer.token)).expect(200);
      expect(order.body).toMatchObject({
        status: 'NEW',
        paymentStatus: 'PARTIALLY_REFUNDED',
        refundedMinor: 20_000,
      });
      expect(
        order.body.sellerOrders.find((so: { id: string }) => so.id === of(sellerB).id).status,
      ).toBe('NEW');

      await vi.waitFor(async () => {
        const types = (await prisma.notification.findMany({ where: { userId: buyer.userId } })).map(
          (n) => n.type,
        );
        expect(types.sort()).toEqual(['payment.refund_requested', 'seller-order.status_changed']);
      }, WAIT);
      const refundEvent = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: orderId, type: 'payment.refund_requested' },
      });
      await vi.waitFor(async () => {
        expect(
          await prisma.processedEvent.count({
            where: { consumer: 'payments', eventId: refundEvent.id },
          }),
        ).toBe(1);
      }, WAIT);

      await seller(sellerB, of(sellerB).id, 'cancel')
        .send({ reason: 'Closing the shop' })
        .expect(200);
      const fullyRefunded = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payment: true },
      });
      expect(fullyRefunded).toMatchObject({
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        refundedMinor: 40_000n,
      });
      expect(fullyRefunded.payment?.status).toBe('REFUNDED');
    });

    it('still lets the other seller accept a partially refunded order', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const [a, b] = await Promise.all([
        createProduct(sellerA, 4_000),
        createProduct(sellerB, 6_000),
      ]);
      const { orderId, of } = await placePaidOrder(buyer, [
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 1 },
      ]);

      await seller(sellerA, of(sellerA).id, 'cancel').send({ reason: 'Out of stock' }).expect(200);
      await seller(sellerB, of(sellerB).id, 'accept')
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({ status: 'PROCESSING', paymentStatus: 'PARTIALLY_REFUNDED' }),
        );
      await seller(sellerB, of(sellerB).id, 'ship').expect(200);

      const order = await http().get(`/api/orders/${orderId}`).set(bearer(buyer.token)).expect(200);
      expect(order.body.status).toBe('SHIPPED');
    });

    it('lets the buyer cancel only before the seller accepted the order', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const [a, b] = await Promise.all([
        createProduct(sellerA, 5_000),
        createProduct(sellerB, 5_000),
      ]);
      const { orderId, of } = await placePaidOrder(buyer, [
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 1 },
      ]);
      const cancel = (sellerOrderId: string) =>
        http()
          .post(`/api/orders/${orderId}/seller-orders/${sellerOrderId}/cancel`)
          .set(bearer(buyer.token))
          .send({ reason: 'Changed my mind' });

      await seller(sellerB, of(sellerB).id, 'accept').expect(200);
      await cancel(of(sellerB).id)
        .expect(409)
        .expect(({ body }) => expect(body.message).toBe('Seller order is already PROCESSING'));

      const res = await cancel(of(sellerA).id).expect(200);
      expect(res.body).toMatchObject({ status: 'PROCESSING', refundedMinor: 5_000 });
    });

    it('refuses to cancel shipped or unpaid seller orders and hides foreign ones', async () => {
      const [buyer, stranger] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const product = await createProduct(sellerA, 3_000);
      const { orderId, of } = await placePaidOrder(buyer, [{ productId: product.id, quantity: 1 }]);
      const so = of(sellerA).id;

      await seller(sellerB, so, 'cancel').send({ reason: 'Not mine' }).expect(404);
      await http()
        .post(`/api/orders/${orderId}/seller-orders/${so}/cancel`)
        .set(bearer(stranger.token))
        .send({})
        .expect(404);

      await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'PENDING' } });
      await seller(sellerA, so, 'cancel')
        .send({ reason: 'Too early' })
        .expect(409)
        .expect(({ body }) => expect(body.message).toMatch(/still being processed/));
      await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'CAPTURED' } });

      await seller(sellerA, so, 'accept').expect(200);
      await seller(sellerA, so, 'ship').expect(200);
      await seller(sellerA, so, 'cancel').send({ reason: 'Too late' }).expect(409);
      await seller(sellerA, so, 'cancel').send({ reason: 'x' }).expect(400);
    });
  });

  describe('partial refunds', () => {
    it('refunds single units, reverses commission exactly and settles the ledger', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 3_333, 10);
      const { orderId, of } = await placePaidOrder(buyer, [{ productId: product.id, quantity: 3 }]);
      const so = of(sellerA);
      const itemId = so.items[0].id;
      await seller(sellerA, so.id, 'accept').expect(200);
      await seller(sellerA, so.id, 'ship').expect(200);
      expect(await stockOf(product.id)).toBe(7);

      const first = await refund(sellerA, so.id, {
        orderItemId: itemId,
        quantity: 1,
        reason: 'Damaged in transit',
      }).expect(201);
      expect(first.body).toMatchObject({
        status: 'SHIPPED',
        refundedMinor: 3_333,
        commissionMinor: 1_000,
        payoutMinor: 5_999,
        paymentStatus: 'PARTIALLY_REFUNDED',
      });
      expect(first.body.refunds).toEqual([
        expect.objectContaining({ quantity: 1, amountMinor: 3_333, commissionReversalMinor: 333 }),
      ]);
      expect(await stockOf(product.id)).toBe(7);

      const rest = await refund(sellerA, so.id, {
        orderItemId: itemId,
        quantity: 2,
        restock: true,
      }).expect(201);
      expect(rest.body).toMatchObject({ refundedMinor: 9_999, payoutMinor: 0 });
      expect(rest.body.refunds[1].commissionReversalMinor).toBe(667);
      expect(await stockOf(product.id)).toBe(9);
      expect(await ledgerBalance(so.id)).toBe(0n);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order).toMatchObject({ paymentStatus: 'REFUNDED', refundedMinor: 9_999n });

      await refund(sellerA, so.id, { orderItemId: itemId, quantity: 1 })
        .expect(409)
        .expect(({ body }) =>
          expect(body.message).toBe('Everything in this order is already refunded'),
        );
    });

    it('returns units to stock automatically before shipping', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerB, 2_000, 5);
      const { of } = await placePaidOrder(buyer, [{ productId: product.id, quantity: 2 }]);
      await seller(sellerB, of(sellerB).id, 'accept').expect(200);

      await refund(sellerB, of(sellerB).id, {
        orderItemId: of(sellerB).items[0].id,
        quantity: 1,
        restock: false,
      }).expect(201);

      expect(await stockOf(product.id)).toBe(4);
    });

    it('is idempotent per key and safe under concurrent refunds of the last unit', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const [product, other] = await Promise.all([
        createProduct(sellerA, 1_500, 5),
        createProduct(sellerA, 700, 5),
      ]);
      const { of } = await placePaidOrder(buyer, [
        { productId: product.id, quantity: 2 },
        { productId: other.id, quantity: 1 },
      ]);
      const so = of(sellerA);
      const itemId = so.items.find((item) => item.productId === product.id)!.id;
      const body = { orderItemId: itemId, quantity: 1 };
      const key = randomUUID();

      const first = await refund(sellerA, so.id, body, key).expect(201);
      const replay = await refund(sellerA, so.id, body, key).expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.refunds).toEqual(first.body.refunds);
      await refund(sellerA, so.id, { ...body, reason: 'other body' }, key).expect(422);

      const race = await Promise.all([refund(sellerA, so.id, body), refund(sellerA, so.id, body)]);
      expect(race.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(race.find((r) => r.status === 400)!.body.message).toBe(
        'Refund quantity must be between 1 and 0',
      );

      expect(await prisma.refund.count({ where: { sellerOrderId: so.id } })).toBe(2);
      const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.refundedQuantity).toBe(2);
    });

    it('closes an unshipped seller order once every unit was refunded', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 4_000, 5);
      const { of } = await placePaidOrder(buyer, [{ productId: product.id, quantity: 2 }]);
      const sellerOrder = of(sellerA);
      await seller(sellerA, sellerOrder.id, 'accept').expect(200);

      await refund(sellerA, sellerOrder.id, { orderItemId: sellerOrder.items[0].id, quantity: 1 })
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('PROCESSING'));
      await refund(sellerA, sellerOrder.id, { orderItemId: sellerOrder.items[0].id, quantity: 1 })
        .expect(201)
        .expect(({ body }) =>
          expect(body).toMatchObject({ status: 'CANCELLED', refundedMinor: 8_000 }),
        );

      await seller(sellerA, sellerOrder.id, 'ship').expect(409);
      expect(await stockOf(product.id)).toBe(5);
      expect(await ledgerBalance(sellerOrder.id)).toBe(0n);
    });

    it('rejects refunds on cancelled or foreign seller orders', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const product = await createProduct(sellerA, 1_000, 5);
      const { of } = await placePaidOrder(buyer, [{ productId: product.id, quantity: 1 }]);
      const so = of(sellerA);
      const body = { orderItemId: so.items[0].id, quantity: 1 };

      await refund(sellerB, so.id, body).expect(404);
      await refund(buyer, so.id, body).expect(403);
      await refund(sellerA, so.id, { orderItemId: randomUUID(), quantity: 1 }).expect(404);
      await http()
        .post(`/api/seller/orders/${so.id}/refunds`)
        .set(bearer(sellerA.token))
        .send(body)
        .expect(400);

      await seller(sellerA, so.id, 'cancel').send({ reason: 'Cannot ship' }).expect(200);
      await refund(sellerA, so.id, body).expect(409);
    });
  });
});
