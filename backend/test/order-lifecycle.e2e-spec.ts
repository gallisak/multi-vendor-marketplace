import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ProductStatus, Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  TestActor,
  uniqueSlug,
} from './helpers.js';

const WAIT = { timeout: 15_000, interval: 100 };
const DECLINED_PRICE = 2_000_000;

describe('Order lifecycle and payment saga (e2e)', () => {
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
        title: `Lifecycle ${uniqueSlug('p')}`,
        description: 'Lifecycle test product',
        priceMinor,
        stock,
        status: ProductStatus.ACTIVE,
      },
    });

  const placeOrder = async (buyer: TestActor, lines: { productId: string; quantity: number }[]) => {
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
    const sellerOrderOf = (seller: TestActor) =>
      (res.body.sellerOrders as { id: string; sellerId: string }[]).find(
        (so) => so.sellerId === seller.sellerId,
      )!.id;
    return { orderId: res.body.id as string, sellerOrderOf };
  };

  const waitForPayment = (orderId: string, status: string) =>
    vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.paymentStatus).toBe(status);
    }, WAIT);

  const orderStatus = async (buyer: TestActor, orderId: string) =>
    (await http().get(`/api/orders/${orderId}`).set(bearer(buyer.token)).expect(200)).body
      .status as string;

  const sellerAction = (seller: TestActor, sellerOrderId: string, action: string) =>
    http().post(`/api/seller/orders/${sellerOrderId}/${action}`).set(bearer(seller.token));

  const confirm = (buyer: TestActor, orderId: string, sellerOrderId: string) =>
    http()
      .post(`/api/orders/${orderId}/seller-orders/${sellerOrderId}/confirm-delivery`)
      .set(bearer(buyer.token));

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    [sellerA, sellerB] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.SELLER),
    ]);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Lifecycle', slug: uniqueSlug('life') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('captures the payment, notifies sellers and walks both seller orders to completion', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const [lamp, chair] = await Promise.all([
      createProduct(sellerA, 10_000),
      createProduct(sellerB, 20_000),
    ]);
    const { orderId, sellerOrderOf } = await placeOrder(buyer, [
      { productId: lamp.id, quantity: 1 },
      { productId: chair.id, quantity: 2 },
    ]);
    const soA = sellerOrderOf(sellerA);
    const soB = sellerOrderOf(sellerB);

    await waitForPayment(orderId, 'CAPTURED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
    expect(payment).toMatchObject({ status: 'CAPTURED', providerRef: `mock_${orderId}` });

    await vi.waitFor(async () => {
      const notified = await prisma.notification.findMany({
        where: { type: 'seller-order.paid', userId: { in: [sellerA.userId, sellerB.userId] } },
      });
      expect(
        notified.filter((n) => (n.payload as { orderId: string }).orderId === orderId),
      ).toHaveLength(2);
    }, WAIT);

    expect(await orderStatus(buyer, orderId)).toBe('NEW');

    await sellerAction(sellerA, soA, 'accept').expect(200);
    expect(await orderStatus(buyer, orderId)).toBe('PROCESSING');

    const shipped = await sellerAction(sellerA, soA, 'ship').expect(200);
    expect(shipped.body).toMatchObject({
      status: 'SHIPPED',
      paymentStatus: 'CAPTURED',
      subtotalMinor: 10_000,
      commissionMinor: 1_000,
      payoutMinor: 9_000,
    });
    expect(await orderStatus(buyer, orderId)).toBe('PARTIALLY_SHIPPED');

    await sellerAction(sellerB, soB, 'accept').expect(200);
    await sellerAction(sellerB, soB, 'ship').expect(200);
    expect(await orderStatus(buyer, orderId)).toBe('SHIPPED');

    const afterFirst = await confirm(buyer, orderId, soA).expect(200);
    expect(afterFirst.body.status).toBe('PARTIALLY_COMPLETED');
    const afterSecond = await confirm(buyer, orderId, soB).expect(200);
    expect(afterSecond.body.status).toBe('COMPLETED');

    await vi.waitFor(async () => {
      expect(
        await prisma.notification.count({
          where: { userId: buyer.userId, type: 'seller-order.status_changed' },
        }),
      ).toBe(6);
    }, WAIT);
  });

  it('compensates a declined payment: cancels every seller order and returns stock', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const [expensive, cheap] = await Promise.all([
      createProduct(sellerA, DECLINED_PRICE, 3),
      createProduct(sellerB, 5_000, 4),
    ]);
    const { orderId } = await placeOrder(buyer, [
      { productId: expensive.id, quantity: 1 },
      { productId: cheap.id, quantity: 2 },
    ]);

    await waitForPayment(orderId, 'FAILED');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { sellerOrders: { include: { ledger: true } }, payment: true },
    });
    expect(order.status).toBe('CANCELLED');
    expect(order.payment?.failReason).toMatch(/declined/);
    for (const sellerOrder of order.sellerOrders) {
      expect(sellerOrder).toMatchObject({ status: 'CANCELLED', cancelReason: 'payment_failed' });
      const balance = sellerOrder.ledger.reduce((sum, entry) => sum + entry.amountMinor, 0n);
      expect(balance).toBe(0n);
      expect(sellerOrder.ledger.map((entry) => entry.type).sort()).toEqual([
        'CANCELLATION',
        'COMMISSION',
        'COMMISSION_CANCELLATION',
        'SALE',
      ]);
    }

    const stock = await prisma.product.findMany({
      where: { id: { in: [expensive.id, cheap.id] } },
      select: { id: true, stock: true },
    });
    expect(Object.fromEntries(stock.map((p) => [p.id, p.stock]))).toEqual({
      [expensive.id]: 3,
      [cheap.id]: 4,
    });

    await vi.waitFor(async () => {
      const notifications = await prisma.notification.findMany({
        where: { userId: buyer.userId },
      });
      expect(notifications.map((n) => n.type)).toEqual(['order.payment_failed']);
    }, WAIT);
    expect(
      await prisma.notification.count({
        where: { type: 'seller-order.paid', userId: { in: [sellerA.userId, sellerB.userId] } },
      }),
    ).toBe(
      await prisma.notification.count({
        where: {
          type: 'seller-order.paid',
          userId: { in: [sellerA.userId, sellerB.userId] },
          NOT: { payload: { path: ['orderId'], equals: orderId } },
        },
      }),
    );
  });

  it('enforces the status flow and payment before acceptance', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const product = await createProduct(sellerA, 7_000);
    const { orderId, sellerOrderOf } = await placeOrder(buyer, [
      { productId: product.id, quantity: 1 },
    ]);
    const so = sellerOrderOf(sellerA);
    await waitForPayment(orderId, 'CAPTURED');

    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'PENDING' } });
    await sellerAction(sellerA, so, 'accept')
      .expect(409)
      .expect(({ body }) => expect(body.message).toBe('The order is not paid yet'));
    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'CAPTURED' } });

    await sellerAction(sellerA, so, 'ship').expect(409);
    await confirm(buyer, orderId, so).expect(409);
    await sellerAction(sellerA, so, 'accept').expect(200);
    await sellerAction(sellerA, so, 'accept').expect(409);
    await confirm(buyer, orderId, so).expect(409);
    await sellerAction(sellerA, so, 'ship').expect(200);
    await sellerAction(sellerA, so, 'ship').expect(409);
    await confirm(buyer, orderId, so).expect(200);
    await confirm(buyer, orderId, so).expect(409);
  });

  it('keeps seller orders private to their seller and buyer', async () => {
    const [buyer, stranger] = await Promise.all([
      createActor(app, prisma, Role.CUSTOMER),
      createActor(app, prisma, Role.CUSTOMER),
    ]);
    const product = await createProduct(sellerA, 3_000);
    const { orderId, sellerOrderOf } = await placeOrder(buyer, [
      { productId: product.id, quantity: 1 },
    ]);
    const so = sellerOrderOf(sellerA);
    await waitForPayment(orderId, 'CAPTURED');

    await http().get(`/api/seller/orders/${so}`).set(bearer(sellerB.token)).expect(404);
    await sellerAction(sellerB, so, 'accept').expect(404);
    await sellerAction(buyer, so, 'accept').expect(403);
    await sellerAction(sellerA, so, 'accept').expect(200);
    await sellerAction(sellerA, so, 'ship').expect(200);
    await confirm(stranger, orderId, so).expect(404);

    const listA = await http().get('/api/seller/orders?limit=100').set(bearer(sellerA.token));
    const listB = await http().get('/api/seller/orders?limit=100').set(bearer(sellerB.token));
    expect(listA.body.items.map((o: { id: string }) => o.id)).toContain(so);
    expect(listB.body.items.map((o: { id: string }) => o.id)).not.toContain(so);
  });

  it('never loses the aggregate status when two sellers ship at the same time', async () => {
    for (let round = 0; round < 5; round++) {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const [a, b] = await Promise.all([
        createProduct(sellerA, 1_000),
        createProduct(sellerB, 1_000),
      ]);
      const { orderId, sellerOrderOf } = await placeOrder(buyer, [
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 1 },
      ]);
      await waitForPayment(orderId, 'CAPTURED');
      await sellerAction(sellerA, sellerOrderOf(sellerA), 'accept').expect(200);
      await sellerAction(sellerB, sellerOrderOf(sellerB), 'accept').expect(200);

      const results = await Promise.all([
        sellerAction(sellerA, sellerOrderOf(sellerA), 'ship'),
        sellerAction(sellerB, sellerOrderOf(sellerB), 'ship'),
      ]);

      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await orderStatus(buyer, orderId)).toBe('SHIPPED');
    }
  });

  it('settles a payment only once when the event is delivered again', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const product = await createProduct(sellerB, 4_000);
    const { orderId } = await placeOrder(buyer, [{ productId: product.id, quantity: 1 }]);
    await waitForPayment(orderId, 'CAPTURED');
    const placed = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: orderId, type: 'order.placed' },
    });
    const payments = app.get(PaymentsService);

    await Promise.all([payments.settle(placed.id, orderId), payments.settle(placed.id, orderId)]);
    await payments.settle(randomUUID(), orderId);

    expect(
      await prisma.outboxEvent.count({
        where: { type: 'seller-order.paid', payload: { path: ['orderId'], equals: orderId } },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: orderId, type: 'order.payment_captured' },
      }),
    ).toBe(1);
  });
});
