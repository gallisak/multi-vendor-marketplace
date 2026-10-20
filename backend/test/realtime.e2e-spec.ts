import { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { ProductStatus, ProductType, Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AccessTokenRevocationService } from '../src/modules/auth/access-token-revocation.service.js';
import type {
  AuctionUpdate,
  OrderUpdate,
  ProductUpdate,
  SellerOrderUpdate,
  SubscribeAck,
} from '../src/modules/realtime/realtime.types.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  TestActor,
  uniqueSlug,
} from './helpers.js';

const TIMEOUT = 10_000;
const HOUR = 60 * 60 * 1000;

describe('Realtime WebSocket (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  let seller: TestActor;
  let categoryId: string;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());

  const connect = (token?: string) =>
    new Promise<{ socket: Socket; userId: string | null }>((resolve, reject) => {
      const socket = io(`${url}/realtime`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      const timer = setTimeout(() => reject(new Error('no ready event')), TIMEOUT);
      socket.on('ready', (payload: { userId: string | null }) => {
        clearTimeout(timer);
        resolve({ socket, userId: payload.userId });
      });
      socket.on('exception', (error: { message: string }) => {
        clearTimeout(timer);
        reject(new Error(error.message));
      });
    });

  const subscribe = (socket: Socket, channel: string, id: string) =>
    socket.timeout(TIMEOUT).emitWithAck('subscribe', { channel, id }) as Promise<SubscribeAck>;

  const next = <T>(socket: Socket, event: string, predicate: (payload: T) => boolean) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no matching ${event}`)), TIMEOUT);
      const listener = (payload: T) => {
        if (predicate(payload)) {
          clearTimeout(timer);
          socket.off(event, listener);
          resolve(payload);
        }
      };
      socket.on(event, listener);
    });

  const createProduct = (stock: number, status: ProductStatus = ProductStatus.ACTIVE) =>
    prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Live ${uniqueSlug('p')}`,
        description: 'Realtime test product',
        priceMinor: 2_000,
        stock,
        status,
      },
    });

  const createLot = () =>
    prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Live lot ${uniqueSlug('l')}`,
        description: 'Realtime auction',
        type: ProductType.AUCTION,
        priceMinor: 10_000,
        stock: 1,
        status: ProductStatus.ACTIVE,
        auction: {
          create: {
            startPriceMinor: 10_000,
            bidStepMinor: 1_000,
            startsAt: new Date(Date.now() - HOUR),
            endsAt: new Date(Date.now() + HOUR),
          },
        },
      },
    });

  const buy = async (buyer: TestActor, productId: string, quantity: number) => {
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
    return res.body as { id: string; sellerOrders: { id: string }[] };
  };

  const bid = (bidder: TestActor, productId: string, amountMinor: number) =>
    http()
      .post(`/api/auctions/${productId}/bids`)
      .set(bearer(bidder.token))
      .set('Idempotency-Key', randomUUID())
      .send({ amountMinor })
      .expect(201);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true, listen: true }));
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    seller = await createActor(app, prisma, Role.SELLER);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Realtime', slug: uniqueSlug('live') } })
    ).id;
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('streams stock changes to everyone watching a product', async () => {
    const product = await createProduct(5);
    const { socket, userId } = await connect();
    expect(userId).toBeNull();

    const ack = await subscribe(socket, 'product', product.id);
    expect(ack).toMatchObject({
      ok: true,
      channel: 'product',
      snapshot: { stock: 5, inStock: true },
    });
    const initial = (ack as { snapshot: ProductUpdate }).snapshot;

    const update = next<ProductUpdate>(socket, 'product.updated', (p) => p.stock === 3);
    await buy(await createActor(app, prisma, Role.CUSTOMER), product.id, 2);

    const received = await update;
    expect(received.productId).toBe(product.id);
    expect(received.version).toBeGreaterThan(initial.version);
  });

  it('broadcasts every accepted bid to all viewers of the auction', async () => {
    const lot = await createLot();
    const [{ socket: first }, { socket: second }] = await Promise.all([connect(), connect()]);
    await Promise.all([subscribe(first, 'auction', lot.id), subscribe(second, 'auction', lot.id)]);

    const updates = [first, second].map((socket) =>
      next<AuctionUpdate>(socket, 'auction.updated', (a) => a.currentPriceMinor === 11_000),
    );
    const bidder = await createActor(app, prisma, Role.CUSTOMER);
    await bid(bidder, lot.id, 10_000);
    await bid(await createActor(app, prisma, Role.CUSTOMER), lot.id, 11_000);

    const [a, b] = await Promise.all(updates);
    expect(a).toMatchObject({ bidCount: 2, minNextBidMinor: 12_000, status: 'ACTIVE' });
    expect(b.version).toBe(a.version);
  });

  it('resyncs a client that missed updates while disconnected', async () => {
    const lot = await createLot();
    const { socket } = await connect();
    const ack = await subscribe(socket, 'auction', lot.id);
    expect((ack as { snapshot: AuctionUpdate }).snapshot.currentPriceMinor).toBeNull();
    socket.disconnect();

    await bid(await createActor(app, prisma, Role.CUSTOMER), lot.id, 10_000);
    await bid(await createActor(app, prisma, Role.CUSTOMER), lot.id, 12_000);

    const { socket: reconnected } = await connect();
    const resync = await subscribe(reconnected, 'auction', lot.id);
    expect(resync).toMatchObject({
      ok: true,
      snapshot: { currentPriceMinor: 12_000, bidCount: 2, minNextBidMinor: 13_000 },
    });
  });

  it('delivers order status changes to the buyer and the seller privately', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const stranger = await createActor(app, prisma, Role.CUSTOMER);
    const product = await createProduct(5);
    const [buyerConn, sellerConn, strangerConn] = await Promise.all([
      connect(buyer.token),
      connect(seller.token),
      connect(stranger.token),
    ]);
    expect(buyerConn.userId).toBe(buyer.userId);
    const leaked: unknown[] = [];
    strangerConn.socket.on('order.updated', (payload) => leaked.push(payload));

    const captured = next<OrderUpdate>(
      buyerConn.socket,
      'order.updated',
      (o) => o.paymentStatus === 'CAPTURED',
    );
    const sellerPaid = next<SellerOrderUpdate>(
      sellerConn.socket,
      'seller-order.updated',
      (o) => o.paymentStatus === 'CAPTURED',
    );
    const order = await buy(buyer, product.id, 1);

    expect((await captured).orderId).toBe(order.id);
    expect((await sellerPaid).sellerOrderId).toBe(order.sellerOrders[0].id);

    const processing = next<OrderUpdate>(
      buyerConn.socket,
      'order.updated',
      (o) => o.status === 'PROCESSING',
    );
    await http()
      .post(`/api/seller/orders/${order.sellerOrders[0].id}/accept`)
      .set(bearer(seller.token))
      .expect(200);
    const update = await processing;
    expect(update.sellerOrders).toEqual([
      expect.objectContaining({ id: order.sellerOrders[0].id, status: 'PROCESSING' }),
    ]);
    expect(leaked).toEqual([]);
  });

  it('rejects connections with an invalid token', async () => {
    await expect(connect('not.a.valid.token')).rejects.toThrow('Invalid or expired access token');
  });

  it('disconnects a socket once its session is revoked', async () => {
    const buyer = await createActor(app, prisma, Role.CUSTOMER);
    const { socket } = await connect(buyer.token);
    const closed = new Promise<string>((resolve) =>
      socket.on('exception', (error: { message: string }) => resolve(error.message)),
    );

    await app.get(AccessTokenRevocationService).revokeIssuedBeforeNow(buyer.userId);

    expect(await closed).toBe('Session was revoked, sign in again');
    await vi.waitFor(() => expect(socket.connected).toBe(false), { timeout: TIMEOUT });
  });

  it('validates subscriptions and hides unpublished products', async () => {
    const pending = await createProduct(1, ProductStatus.PENDING_MODERATION);
    const { socket } = await connect();

    expect(await subscribe(socket, 'orders', randomUUID())).toEqual({
      ok: false,
      error: 'channel must be one of: product, auction',
    });
    expect(await subscribe(socket, 'product', 'not-a-uuid')).toEqual({
      ok: false,
      error: 'id must be a UUID',
    });
    expect(await subscribe(socket, 'product', randomUUID())).toEqual({
      ok: false,
      error: 'product not found',
    });
    expect(await subscribe(socket, 'product', pending.id)).toEqual({
      ok: false,
      error: 'product not found',
    });
  });

  it('sends strictly increasing versions so clients can drop stale messages', async () => {
    const product = await createProduct(10);
    const { socket } = await connect();
    await subscribe(socket, 'product', product.id);
    const versions: number[] = [];
    socket.on('product.updated', (p: ProductUpdate) => versions.push(p.version));

    for (let i = 0; i < 3; i++) {
      await buy(await createActor(app, prisma, Role.CUSTOMER), product.id, 1);
    }
    await next<ProductUpdate>(socket, 'product.updated', (p) => p.stock === 7);

    const unique = [...new Set(versions)];
    expect(unique).toEqual([...unique].sort((a, b) => a - b));
  });
});
