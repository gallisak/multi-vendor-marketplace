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
const HOUR = 60 * 60 * 1000;
const START = 100_000;
const STEP = 5_000;

describe('Auctions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: TestActor;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  const createLot = async (status: ProductStatus = ProductStatus.ACTIVE) => {
    const product = await prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId,
        title: `Lot ${uniqueSlug('lot')}`,
        description: 'Auction test lot',
        type: ProductType.AUCTION,
        priceMinor: START,
        stock: 1,
        status,
        auction: {
          create: {
            startPriceMinor: START,
            bidStepMinor: STEP,
            startsAt: new Date(Date.now() - HOUR),
            endsAt: new Date(Date.now() + HOUR),
          },
        },
      },
      include: { auction: true },
    });
    return { productId: product.id, auctionId: product.auction!.id };
  };

  const bid = (bidder: TestActor, productId: string, amountMinor: number, key = randomUUID()) =>
    http()
      .post(`/api/auctions/${productId}/bids`)
      .set(bearer(bidder.token))
      .set('Idempotency-Key', key)
      .send({ amountMinor });

  const auctionOf = (auctionId: string) =>
    prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });

  const endNow = (auctionId: string) =>
    prisma.auction.update({
      where: { id: auctionId },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

  const waitForStatus = (auctionId: string, status: string) =>
    vi.waitFor(async () => expect((await auctionOf(auctionId)).status).toBe(status), WAIT);

  const notificationsOf = async (user: TestActor, productId: string) =>
    (await prisma.notification.findMany({ where: { userId: user.userId } }))
      .filter((n) => (n.payload as { productId?: string }).productId === productId)
      .map((n) => n.type)
      .sort();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    seller = await createActor(app, prisma, Role.SELLER);
    categoryId = (
      await prisma.category.create({ data: { name: 'E2E Auctions', slug: uniqueSlug('auction') } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('bidding rules', () => {
    it('accepts the start price first and then requires current price plus step', async () => {
      const [alice, bob] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const { productId } = await createLot();

      await bid(alice, productId, START - 1)
        .expect(409)
        .expect(({ body }) => expect(body.message).toBe(`Bid must be at least ${START}`));
      const first = await bid(alice, productId, START).expect(201);
      expect(first.body).toMatchObject({
        amountMinor: START,
        bidCount: 1,
        minNextBidMinor: START + STEP,
      });

      await bid(bob, productId, START + STEP - 1).expect(409);
      await bid(alice, productId, START + 50_000)
        .expect(409)
        .expect(({ body }) => expect(body.message).toBe('You are already the highest bidder'));
      await bid(bob, productId, START + STEP).expect(201);
      await bid(seller, productId, START + 100_000)
        .expect(400)
        .expect(({ body }) => expect(body.message).toBe('You cannot bid on your own lot'));

      const view = await http().get(`/api/auctions/${productId}`).expect(200);
      expect(view.body).toMatchObject({
        status: 'ACTIVE',
        currentPriceMinor: START + STEP,
        minNextBidMinor: START + 2 * STEP,
        bidCount: 2,
        leader: 'E***',
      });
      expect(view.body.recentBids.map((b: { amountMinor: number }) => b.amountMinor)).toEqual([
        START + STEP,
        START,
      ]);
      const product = await http().get(`/api/products/${productId}`).expect(200);
      expect(product.body.priceMinor).toBe(START + STEP);

      await vi.waitFor(async () => {
        expect(await notificationsOf(alice, productId)).toEqual(['auction.outbid']);
      }, WAIT);
    });

    it('replays a retried bid instead of placing it twice', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const { productId, auctionId } = await createLot();
      const key = randomUUID();

      const first = await bid(buyer, productId, START, key).expect(201);
      const retry = await bid(buyer, productId, START, key).expect(201);

      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await prisma.bid.count({ where: { auctionId } })).toBe(1);
      await bid(buyer, productId, START + STEP, key).expect(422);
    });

    it('hides lots that are not approved yet', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const { productId } = await createLot(ProductStatus.PENDING_MODERATION);

      await bid(buyer, productId, START).expect(404);
      await http().get(`/api/auctions/${productId}`).expect(404);
    });
  });

  describe('concurrency', () => {
    it('loses no update when many different bids arrive at once', async () => {
      const bidders = await Promise.all(
        Array.from({ length: 12 }, () => createActor(app, prisma, Role.CUSTOMER)),
      );
      const { productId, auctionId } = await createLot();

      const results = await Promise.all(
        bidders.map((bidder, i) => bid(bidder, productId, START + i * STEP)),
      );

      const accepted = results.filter((r) => r.status === 201);
      expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
      expect(accepted.length).toBeGreaterThan(0);
      const auction = await auctionOf(auctionId);
      const bids = await prisma.bid.findMany({
        where: { auctionId },
        orderBy: { amountMinor: 'desc' },
      });
      expect(auction.bidCount).toBe(accepted.length);
      expect(bids).toHaveLength(accepted.length);
      expect(auction.currentPriceMinor).toBe(bids[0].amountMinor);
      expect(auction.leaderId).toBe(bids[0].bidderId);
      const amounts = bids.map((b) => b.amountMinor);
      expect(new Set(amounts).size).toBe(amounts.length);
    });

    it('accepts exactly one of many equal bids', async () => {
      const bidders = await Promise.all(
        Array.from({ length: 8 }, () => createActor(app, prisma, Role.CUSTOMER)),
      );
      const { productId, auctionId } = await createLot();

      const results = await Promise.all(bidders.map((bidder) => bid(bidder, productId, START)));

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(7);
      expect(await prisma.bid.count({ where: { auctionId } })).toBe(1);
    });

    it('rejects a bid that arrives after the deadline, even before the sweeper runs', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const { productId, auctionId } = await createLot();
      await endNow(auctionId);

      await bid(buyer, productId, START).expect(409);
      expect(await prisma.bid.count({ where: { auctionId } })).toBe(0);
    });
  });

  describe('closing', () => {
    it('awards the lot to the highest bidder who can then check out at the winning price', async () => {
      const [winner, other] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const { productId, auctionId } = await createLot();
      await bid(other, productId, START).expect(201);
      await bid(winner, productId, START + 3 * STEP).expect(201);
      await endNow(auctionId);

      await waitForStatus(auctionId, 'AWAITING_CHECKOUT');
      const closed = await auctionOf(auctionId);
      expect(closed.winnerId).toBe(winner.userId);
      expect(closed.checkoutDeadline!.getTime()).toBeGreaterThan(Date.now() + HOUR - 60_000);
      const listed = await http().get(`/api/products?sellerId=${seller.sellerId}&limit=100`);
      expect(listed.body.items.map((p: { id: string }) => p.id)).not.toContain(productId);
      await vi.waitFor(async () => {
        expect(await notificationsOf(winner, productId)).toEqual(['auction.won']);
        expect(await notificationsOf(seller, productId)).toEqual(['auction.closed']);
      }, WAIT);

      const checkout = (buyer: TestActor, key = randomUUID()) =>
        http()
          .post(`/api/auctions/${productId}/checkout`)
          .set(bearer(buyer.token))
          .set('Idempotency-Key', key);
      await checkout(other).expect(404);
      const key = randomUUID();
      const order = await checkout(winner, key).expect(201);
      expect(order.body).toMatchObject({ totalMinor: START + 3 * STEP, status: 'NEW' });
      expect(order.body.sellerOrders[0].items[0]).toMatchObject({
        productId,
        quantity: 1,
        unitPriceMinor: START + 3 * STEP,
      });
      const replay = await checkout(winner, key).expect(201);
      expect(replay.body.id).toBe(order.body.id);
      await checkout(winner)
        .expect(409)
        .expect(({ body }) => expect(body.message).toBe('This auction is not awaiting checkout'));

      expect((await auctionOf(auctionId)).status).toBe('SOLD');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(0);
      await vi.waitFor(async () => {
        const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.body.id } });
        expect(paid.paymentStatus).toBe('CAPTURED');
      }, WAIT);
    });

    it('tells the viewer whether they sell, lead or won the lot', async () => {
      const [bidder, other] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const { productId, auctionId } = await createLot();
      await bid(bidder, productId, START).expect(201);
      const viewAs = (token?: string) => {
        const req = http().get(`/api/auctions/${productId}`);
        return (token ? req.set(bearer(token)) : req).expect(200);
      };

      expect((await viewAs()).body.viewer).toBeNull();
      expect((await viewAs('not-a-jwt')).body.viewer).toBeNull();
      expect((await viewAs(seller.token)).body.viewer).toEqual({
        isSeller: true,
        isLeader: false,
        isWinner: false,
      });
      expect((await viewAs(bidder.token)).body.viewer).toMatchObject({ isLeader: true });
      expect((await viewAs(other.token)).body.viewer).toMatchObject({ isLeader: false });

      await endNow(auctionId);
      await waitForStatus(auctionId, 'AWAITING_CHECKOUT');
      expect((await viewAs(bidder.token)).body.viewer).toMatchObject({ isWinner: true });
      expect((await viewAs(other.token)).body.viewer).toMatchObject({ isWinner: false });
    });

    it('marks a lot without bids as unsold and stops accepting bids', async () => {
      const buyer = await createActor(app, prisma, Role.CUSTOMER);
      const { productId, auctionId } = await createLot();
      await endNow(auctionId);

      await waitForStatus(auctionId, 'UNSOLD');
      await bid(buyer, productId, START)
        .expect(409)
        .expect(({ body }) => expect(body.message).toBe('This auction is not accepting bids'));
      await vi.waitFor(async () => {
        expect(await notificationsOf(seller, productId)).toEqual(['auction.closed']);
      }, WAIT);
      const view = await http().get(`/api/auctions/${productId}`).expect(200);
      expect(view.body.status).toBe('UNSOLD');
    });

    it('puts the lot back on sale when the winner misses the checkout window', async () => {
      const [winner, nextBidder] = await Promise.all([
        createActor(app, prisma, Role.CUSTOMER),
        createActor(app, prisma, Role.CUSTOMER),
      ]);
      const { productId, auctionId } = await createLot();
      await bid(winner, productId, START + STEP).expect(201);
      await endNow(auctionId);
      await waitForStatus(auctionId, 'AWAITING_CHECKOUT');

      await prisma.auction.update({
        where: { id: auctionId },
        data: { checkoutDeadline: new Date(Date.now() - 1000) },
      });
      await waitForStatus(auctionId, 'ACTIVE');

      const relisted = await auctionOf(auctionId);
      expect(relisted).toMatchObject({
        bidCount: 0,
        currentPriceMinor: null,
        leaderId: null,
        winnerId: null,
        checkoutDeadline: null,
      });
      const duration = relisted.endsAt.getTime() - relisted.startsAt.getTime();
      expect(Math.abs(duration - HOUR)).toBeLessThan(60_000);
      expect(relisted.endsAt.getTime()).toBeGreaterThan(Date.now() + HOUR - 60_000);
      const product = await http().get(`/api/products/${productId}`).expect(200);
      expect(product.body).toMatchObject({ status: 'ACTIVE', priceMinor: START });
      const view = await http().get(`/api/auctions/${productId}`).expect(200);
      expect(view.body).toMatchObject({ bidCount: 0, recentBids: [], minNextBidMinor: START });

      await http()
        .post(`/api/auctions/${productId}/checkout`)
        .set(bearer(winner.token))
        .set('Idempotency-Key', randomUUID())
        .expect(404);
      await bid(nextBidder, productId, START).expect(201);
      await vi.waitFor(async () => {
        expect(await notificationsOf(winner, productId)).toEqual([
          'auction.checkout_expired',
          'auction.won',
        ]);
        expect(await notificationsOf(seller, productId)).toEqual([
          'auction.closed',
          'auction.relisted',
        ]);
      }, WAIT);
    });
  });

  describe('moderation and failed winner orders', () => {
    it('never publishes a lot that ended while rejected or awaiting moderation', async () => {
      const rejected = await createLot(ProductStatus.REJECTED);
      const pending = await createLot(ProductStatus.PENDING_MODERATION);
      await endNow(rejected.auctionId);
      await endNow(pending.auctionId);

      await waitForStatus(rejected.auctionId, 'CANCELLED');
      await waitForStatus(pending.auctionId, 'CANCELLED');
      const products = await prisma.product.findMany({
        where: { id: { in: [rejected.productId, pending.productId] } },
        orderBy: { status: 'asc' },
      });
      expect(products.map((p) => p.status).sort()).toEqual(['PENDING_MODERATION', 'REJECTED']);
      await http().get(`/api/products/${rejected.productId}`).expect(404);
      await http().get(`/api/auctions/${pending.productId}`).expect(404);
    });

    it('refuses to edit or hide a lot once bidding has started', async () => {
      const bidder = await createActor(app, prisma, Role.CUSTOMER);
      const admin = await createActor(app, prisma, Role.ADMIN);
      const { productId } = await createLot();
      await http()
        .patch(`/api/seller/products/${productId}`)
        .set(bearer(seller.token))
        .send({ description: 'Edited before any bids' })
        .expect(200);
      await http()
        .post(`/api/admin/products/${productId}/approve`)
        .set(bearer(admin.token))
        .expect(200);
      await bid(bidder, productId, START).expect(201);

      await http()
        .patch(`/api/seller/products/${productId}`)
        .set(bearer(seller.token))
        .send({ title: 'Renamed mid auction' })
        .expect(409);

      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(product.status).toBe(ProductStatus.ACTIVE);
      await http().get(`/api/auctions/${productId}`).expect(200);
    });

    it('counts the bidding window from approval, not from creation', async () => {
      const admin = await createActor(app, prisma, Role.ADMIN);
      const { productId, auctionId } = await createLot(ProductStatus.PENDING_MODERATION);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { startsAt: new Date(Date.now() - 10 * 24 * HOUR) },
      });

      await http()
        .post(`/api/admin/products/${productId}/approve`)
        .set(bearer(admin.token))
        .expect(200);

      const auction = await auctionOf(auctionId);
      expect(Math.abs(auction.startsAt.getTime() - Date.now())).toBeLessThan(60_000);
    });

    it('puts the lot back on sale when the winning order is not paid', async () => {
      const winner = await createActor(app, prisma, Role.CUSTOMER);
      const { productId, auctionId } = await createLot();
      const price = 2_000_000;
      await bid(winner, productId, price).expect(201);
      await endNow(auctionId);
      await waitForStatus(auctionId, 'AWAITING_CHECKOUT');

      const order = await http()
        .post(`/api/auctions/${productId}/checkout`)
        .set(bearer(winner.token))
        .set('Idempotency-Key', randomUUID())
        .expect(201);
      await vi.waitFor(async () => {
        const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.body.id } });
        expect(stored.paymentStatus).toBe('FAILED');
      }, WAIT);

      const relisted = await auctionOf(auctionId);
      expect(relisted).toMatchObject({ status: 'ACTIVE', bidCount: 0, winnerId: null });
      expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
        status: 'ACTIVE',
        stock: 1,
        priceMinor: START,
      });
      await vi.waitFor(async () => {
        expect(await notificationsOf(seller, productId)).toContain('auction.relisted');
        expect(await notificationsOf(winner, productId)).not.toContain('auction.checkout_expired');
      }, WAIT);
      await bid(winner, productId, START).expect(201);
    });
  });
});
