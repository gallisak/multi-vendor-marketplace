import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ProductStatus, Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  MockPayoutGateway,
  PAYOUT_GATEWAY,
  type PayoutGateway,
} from '../src/modules/ledger/payout-gateway.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  TestActor,
  uniqueSlug,
} from './helpers.js';

const WAIT = { timeout: 15_000, interval: 100 };
const PAST_HOLD = new Date(Date.now() - 2 * 60 * 60 * 1000);

describe('Seller payouts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: TestActor;
  let admin: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());
  const provider = new MockPayoutGateway();
  const gateway = {
    transfer: vi.fn<PayoutGateway['transfer']>((req) => provider.transfer(req)),
  } satisfies PayoutGateway;

  const deliveredOrder = async (buyer: TestActor, priceMinor: number, owner = seller) => {
    const product = await prisma.product.create({
      data: {
        sellerId: owner.sellerId!,
        categoryId,
        title: `Payout ${uniqueSlug('p')}`,
        description: 'Payout test product',
        priceMinor,
        stock: 5,
        status: ProductStatus.ACTIVE,
      },
    });
    await http()
      .put(`/api/cart/items/${product.id}`)
      .set(bearer(buyer.token))
      .send({ quantity: 1 })
      .expect(200);
    const res = await http()
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const orderId = res.body.id as string;
    const sellerOrderId = res.body.sellerOrders[0].id as string;
    const itemId = res.body.sellerOrders[0].items[0].id as string;
    await vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.paymentStatus).toBe('CAPTURED');
    }, WAIT);
    for (const action of ['accept', 'ship']) {
      await http()
        .post(`/api/seller/orders/${sellerOrderId}/${action}`)
        .set(bearer(owner.token))
        .expect(200);
    }
    await http()
      .post(`/api/orders/${orderId}/seller-orders/${sellerOrderId}/confirm-delivery`)
      .set(bearer(buyer.token))
      .expect(200);
    return { orderId, sellerOrderId, itemId };
  };

  const pastHold = (sellerOrderId: string) =>
    prisma.sellerOrder.update({ where: { id: sellerOrderId }, data: { completedAt: PAST_HOLD } });

  const payouts = () => http().get('/api/seller/payouts').set(bearer(seller.token)).expect(200);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      withWorker: true,
      overrides: [{ token: PAYOUT_GATEWAY, value: gateway }],
    }));
    [seller, admin] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.ADMIN),
    ]);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Payouts', slug: uniqueSlug('payout') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('holds earnings until the hold period ends, then pays them out once', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const order = await deliveredOrder(buyer, 20_000);

    const completed = await prisma.sellerOrder.findUniqueOrThrow({
      where: { id: order.sellerOrderId },
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const held = await payouts();
    expect(held.body).toMatchObject({ pendingMinor: 18_000, paidOutMinor: 0, total: 0 });

    await pastHold(order.sellerOrderId);

    await vi.waitFor(async () => {
      const paid = await payouts();
      expect(paid.body).toMatchObject({ pendingMinor: 0, paidOutMinor: 18_000, total: 1 });
      expect(paid.body.items[0]).toMatchObject({
        sellerId: seller.sellerId,
        amountMinor: 18_000,
        entriesSettled: 2,
        status: 'PAID',
      });
      expect(paid.body.items[0].providerRef).toMatch(/^mock_transfer_/);
    }, WAIT);

    const entries = await prisma.ledgerEntry.findMany({ where: { sellerId: seller.sellerId } });
    const payoutEntry = entries.find((entry) => entry.type === 'PAYOUT')!;
    expect(payoutEntry).toMatchObject({ amountMinor: -18_000n, sellerOrderId: null });
    expect(entries.every((entry) => entry.payoutId === payoutEntry.payoutId)).toBe(true);
    expect(entries.reduce((sum, entry) => sum + entry.amountMinor, 0n)).toBe(0n);

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await prisma.payout.count({ where: { sellerId: seller.sellerId } })).toBe(1);
    await vi.waitFor(async () => {
      const notifications = await prisma.notification.findMany({
        where: { userId: seller.userId, type: 'payout.paid' },
      });
      expect(notifications.map((n) => n.payload)).toEqual([
        { payoutId: payoutEntry.payoutId, amountMinor: '18000' },
      ]);
    }, WAIT);
  });

  it('waits for an open dispute to be decided', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const order = await deliveredOrder(buyer, 10_000);
    const dispute = await http()
      .post(`/api/orders/${order.orderId}/seller-orders/${order.sellerOrderId}/disputes`)
      .set(bearer(buyer.token))
      .send({ reason: 'The parcel was empty when it arrived' })
      .expect(201);
    await pastHold(order.sellerOrderId);

    await new Promise((resolve) => setTimeout(resolve, 800));
    expect((await payouts()).body.total).toBe(1);

    await http()
      .post(`/api/admin/disputes/${dispute.body.id}/resolve`)
      .set(bearer(admin.token))
      .send({ decision: 'SELLER', note: 'Delivery photo shows the item' })
      .expect(200);

    await vi.waitFor(async () => {
      const paid = await payouts();
      expect(paid.body).toMatchObject({ total: 2, paidOutMinor: 27_000, pendingMinor: 0 });
      expect(paid.body.items[0].amountMinor).toBe(9_000);
    }, WAIT);
  });

  it('nets a refund made after the payout against the next payout', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const first = await deliveredOrder(buyer, 10_000);
    await pastHold(first.sellerOrderId);
    await vi.waitFor(async () => {
      expect((await payouts()).body.paidOutMinor).toBe(36_000);
    }, WAIT);

    await http()
      .post(`/api/seller/orders/${first.sellerOrderId}/refunds`)
      .set(bearer(seller.token))
      .set('Idempotency-Key', randomUUID())
      .send({ orderItemId: first.itemId, quantity: 1 })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect((await payouts()).body).toMatchObject({ pendingMinor: -9_000, total: 3 });

    const second = await deliveredOrder(buyer, 30_000);
    await pastHold(second.sellerOrderId);
    await vi.waitFor(async () => {
      const paid = await payouts();
      expect(paid.body).toMatchObject({ total: 4, pendingMinor: 0, paidOutMinor: 54_000 });
      expect(paid.body.items[0].amountMinor).toBe(18_000);
    }, WAIT);
  });

  it('shows payouts to admins and keeps them private between sellers', async () => {
    const [other, customer] = await Promise.all([
      createActor(app, prisma, Role.SELLER),
      createActor(app, prisma, Role.CUSTOMER),
    ]);

    const all = await http()
      .get(`/api/admin/payouts?sellerId=${seller.sellerId}`)
      .set(bearer(admin.token))
      .expect(200);
    expect(all.body.total).toBe(4);
    expect(all.body.items.every((p: { sellerId: string }) => p.sellerId === seller.sellerId)).toBe(
      true,
    );

    const own = await http().get('/api/seller/payouts').set(bearer(other.token)).expect(200);
    expect(own.body).toMatchObject({ total: 0, pendingMinor: 0, paidOutMinor: 0 });
    await http().get('/api/seller/payouts').set(bearer(customer.token)).expect(403);
    await http().get('/api/admin/payouts').set(bearer(seller.token)).expect(403);
  });

  it('keeps revenue reports independent of payouts', async () => {
    const res = await http().get('/api/seller/dashboard').set(bearer(seller.token)).expect(200);

    expect(res.body.revenue.allTime).toMatchObject({ payoutMinor: 54_000 });
    expect(res.body.payouts).toEqual({ pendingMinor: 0, paidOutMinor: 54_000 });
  });

  it('books the payout first and retries the transfer until the provider accepts it', async () => {
    const owner = await createActor(app, prisma, Role.SELLER);
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    let providerDown!: () => void;
    const outage = new Promise<void>((resolve) => (providerDown = resolve));
    let failed = false;
    gateway.transfer.mockImplementation(async (req) => {
      if (req.sellerId === owner.sellerId && !failed) {
        failed = true;
        await outage;
        throw new Error('provider down');
      }
      return provider.transfer(req);
    });

    try {
      const order = await deliveredOrder(buyer, 10_000, owner);
      await pastHold(order.sellerOrderId);

      const booked = await vi.waitFor(async () => {
        const payout = await prisma.payout.findFirstOrThrow({
          where: { sellerId: owner.sellerId! },
        });
        expect(payout).toMatchObject({ status: 'PENDING', providerRef: null, paidAt: null });
        return payout;
      }, WAIT);
      const pending = await http().get('/api/seller/payouts').set(bearer(owner.token)).expect(200);
      expect(pending.body).toMatchObject({ pendingMinor: 0, paidOutMinor: 9_000, total: 1 });
      expect(pending.body.items[0]).toMatchObject({ status: 'PENDING', providerRef: null });

      providerDown();

      await vi.waitFor(async () => {
        const payout = await prisma.payout.findUniqueOrThrow({ where: { id: booked.id } });
        expect(payout).toMatchObject({
          status: 'PAID',
          providerRef: `mock_transfer_${booked.id}`,
        });
      }, WAIT);
      const calls = gateway.transfer.mock.calls.filter(([req]) => req.sellerId === owner.sellerId);
      expect(calls.map(([req]) => req.idempotencyKey)).toEqual([booked.id, booked.id]);
      expect(await prisma.payout.count({ where: { sellerId: owner.sellerId! } })).toBe(1);
      await vi.waitFor(async () => {
        expect(
          await prisma.notification.count({ where: { userId: owner.userId, type: 'payout.paid' } }),
        ).toBe(1);
      }, WAIT);
    } finally {
      gateway.transfer.mockImplementation((req) => provider.transfer(req));
    }
  });

  it('leaves sales out of the pending balance until the payment is captured', async () => {
    const otherSeller = await createActor(app, prisma, Role.SELLER);
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const product = await prisma.product.create({
      data: {
        sellerId: otherSeller.sellerId!,
        categoryId,
        title: `Payout ${uniqueSlug('p')}`,
        description: 'Payout test product',
        priceMinor: 10_000,
        stock: 5,
        status: ProductStatus.ACTIVE,
      },
    });
    await http()
      .put(`/api/cart/items/${product.id}`)
      .set(bearer(buyer.token))
      .send({ quantity: 1 })
      .expect(200);
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
    const balance = () =>
      http().get('/api/seller/payouts').set(bearer(otherSeller.token)).expect(200);

    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'PENDING' } });
    expect((await balance()).body).toMatchObject({ pendingMinor: 0, paidOutMinor: 0 });

    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'CAPTURED' } });
    expect((await balance()).body).toMatchObject({ pendingMinor: 9_000, paidOutMinor: 0 });
  });
});
