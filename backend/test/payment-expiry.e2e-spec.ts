import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ProductStatus, Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  type ChargeResult,
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../src/modules/payments/payment-gateway.js';
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
const LATER = () => new Date(Date.now() + 60_000);

describe('Payment expiry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let seller: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  const held = new Map<string, (result: ChargeResult) => void>();
  let holdCharges = true;
  const gateway = {
    charge: vi.fn<PaymentGateway['charge']>((req) =>
      holdCharges
        ? new Promise<ChargeResult>((resolve) => held.set(req.idempotencyKey, resolve))
        : Promise.resolve({ ok: true, providerRef: `mock_${req.idempotencyKey}` }),
    ),
    refund: vi.fn<PaymentGateway['refund']>((req) =>
      Promise.resolve({ ok: true, providerRef: `refund_${req.idempotencyKey}` }),
    ),
  } satisfies PaymentGateway;

  const placeOrder = async (quantity: number) => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const product = await prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Expiry ${uniqueSlug('p')}`,
        description: 'Payment expiry test product',
        priceMinor: 5_000,
        stock: 5,
        status: ProductStatus.ACTIVE,
      },
    });
    await http()
      .put(`/api/cart/items/${product.id}`)
      .set(bearer(buyer.token))
      .send({ quantity })
      .expect(200);
    const res = await http()
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    return { orderId: res.body.id as string, productId: product.id };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      withWorker: true,
      overrides: [{ token: PAYMENT_GATEWAY, value: gateway }],
    }));
    payments = app.get(PaymentsService);
    seller = await createActor(app, prisma, Role.SELLER);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Expiry', slug: uniqueSlug('expiry') } })
    ).id;
  });

  afterAll(async () => {
    const pending = [...held.keys()];
    for (const resolve of held.values()) resolve({ ok: false, reason: 'test finished' });
    await vi.waitFor(async () => {
      const unsettled = await prisma.payment.count({
        where: { orderId: { in: pending }, status: 'PENDING' },
      });
      expect(unsettled).toBe(0);
    }, WAIT);
    await cleanupE2eData(prisma);
    await app.close();
  });

  beforeEach(() => {
    holdCharges = true;
    gateway.refund.mockClear();
  });

  it('fails an unconfirmed payment, returns the stock and voids a charge that arrives late', async () => {
    const { orderId, productId } = await placeOrder(2);
    await vi.waitFor(() => expect(held.has(orderId)).toBe(true), WAIT);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(3);

    expect(await payments.expireStale(LATER())).toBeGreaterThanOrEqual(1);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { sellerOrders: true, payment: true },
    });
    expect(order.paymentStatus).toBe('FAILED');
    expect(order.payment?.status).toBe('FAILED');
    expect(order.sellerOrders.map((so) => so.status)).toEqual(['CANCELLED']);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(5);
    expect(gateway.refund).not.toHaveBeenCalled();

    held.get(orderId)!({ ok: true, providerRef: `mock_${orderId}` });
    held.delete(orderId);

    await vi.waitFor(
      () =>
        expect(gateway.refund).toHaveBeenCalledWith(
          expect.objectContaining({ idempotencyKey: `void_${orderId}`, amountMinor: 10_000n }),
        ),
      WAIT,
    );
    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.paymentStatus).toBe('FAILED');
  });

  it('keeps the payment captured when the same order.placed is settled twice at once', async () => {
    const { orderId } = await placeOrder(1);
    await vi.waitFor(() => expect(held.has(orderId)).toBe(true), WAIT);

    const charges: ((result: ChargeResult) => void)[] = [];
    const deferred = () =>
      new Promise<ChargeResult>((resolve) => {
        charges.push(resolve);
      });
    gateway.charge.mockImplementationOnce(deferred).mockImplementationOnce(deferred);

    const eventId = randomUUID();
    const first = payments.settle(eventId, orderId);
    const second = payments.settle(eventId, orderId);
    await vi.waitFor(() => expect(charges).toHaveLength(2), WAIT);
    for (const resolve of charges) resolve({ ok: true, providerRef: `mock_${orderId}` });
    await Promise.all([first, second]);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payment: true },
    });
    expect(order.paymentStatus).toBe('CAPTURED');
    expect(order.payment?.status).toBe('CAPTURED');
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('leaves captured payments and fresh pending ones alone', async () => {
    holdCharges = false;
    const captured = await placeOrder(1);
    await vi.waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: captured.orderId } });
      expect(order.paymentStatus).toBe('CAPTURED');
    }, WAIT);

    holdCharges = true;
    const fresh = await placeOrder(1);
    await vi.waitFor(() => expect(held.has(fresh.orderId)).toBe(true), WAIT);

    await payments.expireStale(new Date(Date.now() - 60_000));

    const [capturedOrder, freshOrder] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: captured.orderId } }),
      prisma.order.findUniqueOrThrow({ where: { id: fresh.orderId } }),
    ]);
    expect(capturedOrder.paymentStatus).toBe('CAPTURED');
    expect(freshOrder.paymentStatus).toBe('PENDING');
  });
});
