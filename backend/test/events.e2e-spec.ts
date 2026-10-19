import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PublishedEvent } from '../src/common/events/domain-events.js';
import { productChanged } from '../src/common/events/domain-events.js';
import { ProductStatus, Role } from '../src/generated/prisma/enums.js';
import { MaintenanceService } from '../src/infra/outbox/maintenance.service.js';
import { OutboxService } from '../src/infra/outbox/outbox.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { NotificationsProcessor } from '../src/modules/notifications/notifications.processor.js';
import { SEARCH_INDEX, type SearchIndex } from '../src/modules/search/search-index.port.js';
import { SearchSyncService } from '../src/modules/search/search-sync.service.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  loginAs,
  TestActor,
  uniqueSlug,
} from './helpers.js';

const WAIT = { timeout: 15_000, interval: 100 };

describe('Outbox, queues and search sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestActor;
  let seller: TestActor;
  let rootCategoryId: string;
  let leafCategoryId: string;
  const http = () => request(app.getHttpServer());

  const createProduct = (title: string, correlationId: string = randomUUID()) =>
    http()
      .post('/api/seller/products')
      .set(bearer(seller.token))
      .set('x-correlation-id', correlationId)
      .send({
        title,
        description: 'Outbox test product',
        categoryId: leafCategoryId,
        type: 'FIXED_PRICE',
        priceMinor: 25_000,
        stock: 4,
      })
      .expect(201);

  const searchIds = async (q: string) => {
    const res = await http()
      .get(`/api/search?q=${encodeURIComponent(q)}`)
      .expect(200);
    return { ids: res.body.items.map((i: { id: string }) => i.id) as string[], body: res.body };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ withWorker: true }));
    [admin, seller] = await Promise.all([
      createActor(app, prisma, Role.ADMIN),
      createActor(app, prisma, Role.SELLER),
    ]);
    const root = await prisma.category.create({
      data: { name: 'E2E Outbox Root', slug: uniqueSlug('outbox-root') },
    });
    const leaf = await prisma.category.create({
      data: { name: 'E2E Outbox Leaf', slug: uniqueSlug('outbox-leaf'), parentId: root.id },
    });
    rootCategoryId = root.id;
    leafCategoryId = leaf.id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('transactional outbox', () => {
    it('stores the event in the same transaction and keeps the request correlation id', async () => {
      const created = await createProduct(`Outbox ${uniqueSlug('t')}`, 'outbox-correlation-1');

      const event = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: created.body.id },
      });
      expect(event).toMatchObject({
        type: 'product.changed',
        aggregateType: 'product',
        correlationId: 'outbox-correlation-1',
        payload: { productId: created.body.id, reason: 'created' },
      });
    });

    it('drops the event when the business transaction rolls back', async () => {
      const outbox = app.get(OutboxService);
      const productId = randomUUID();

      await expect(
        prisma.$transaction(async (tx) => {
          await outbox.add(tx, productChanged(productId, 'updated'));
          throw new Error('business rule violated');
        }),
      ).rejects.toThrow('business rule violated');

      expect(await prisma.outboxEvent.count({ where: { aggregateId: productId } })).toBe(0);
    });

    it('does not emit an event for a rejected API operation', async () => {
      const created = await createProduct(`Rollback ${uniqueSlug('t')}`);

      await http()
        .post(`/api/seller/products/${created.body.id}/stock-adjustments`)
        .set(bearer(seller.token))
        .send({ delta: -100 })
        .expect(409);

      const events = await prisma.outboxEvent.findMany({
        where: { aggregateId: created.body.id },
      });
      expect(events.map((e) => (e.payload as { reason: string }).reason)).toEqual(['created']);
    });

    it('relays pending events to the queues and marks them as published', async () => {
      const created = await createProduct(`Relay ${uniqueSlug('t')}`);

      await vi.waitFor(async () => {
        const event = await prisma.outboxEvent.findFirstOrThrow({
          where: { aggregateId: created.body.id },
        });
        expect(event.publishedAt).not.toBeNull();
      }, WAIT);
    });
  });

  describe('search index sync', () => {
    it('indexes approved products only and removes them after archiving', async () => {
      const title = `Searchable ${uniqueSlug('s')}`;
      const created = await createProduct(title);

      await vi.waitFor(async () => {
        const event = await prisma.outboxEvent.findFirstOrThrow({
          where: { aggregateId: created.body.id },
        });
        expect(event.publishedAt).not.toBeNull();
      }, WAIT);
      expect((await searchIds(title)).ids).not.toContain(created.body.id);

      await http()
        .post(`/api/admin/products/${created.body.id}/approve`)
        .set(bearer(admin.token))
        .expect(200);

      await vi.waitFor(async () => {
        const { ids, body } = await searchIds(title);
        expect(body.source).toBe('search');
        expect(ids).toContain(created.body.id);
        expect(body.facets.categoryIds[rootCategoryId]).toBeGreaterThanOrEqual(1);
        expect(body.facets.categoryIds[leafCategoryId]).toBeGreaterThanOrEqual(1);
      }, WAIT);

      await http()
        .delete(`/api/seller/products/${created.body.id}`)
        .set(bearer(seller.token))
        .expect(204);

      await vi.waitFor(async () => {
        expect((await searchIds(title)).ids).not.toContain(created.body.id);
      }, WAIT);
    });

    it('drops documents of products that no longer exist on a full reindex', async () => {
      const index = app.get<SearchIndex>(SEARCH_INDEX);
      const orphanId = randomUUID();
      await index.upsert([
        {
          id: orphanId,
          title: 'Orphan',
          description: 'Product deleted from the database',
          type: 'FIXED_PRICE',
          priceMinor: 100,
          currentBidMinor: null,
          stock: 1,
          inStock: true,
          imageUrl: null,
          ratingAvg: 0,
          ratingCount: 0,
          categoryId: leafCategoryId,
          categoryName: 'Gone',
          categoryIds: [leafCategoryId],
          sellerId: seller.sellerId!,
          sellerName: 'Gone',
          auctionEndsAt: null,
          createdAt: Date.now(),
        },
      ]);
      expect(await index.allIds()).toContain(orphanId);

      await app.get(SearchSyncService).reindexAll();

      expect(await index.allIds()).not.toContain(orphanId);
    });

    it('filters search results by the category subtree', async () => {
      const title = `Faceted ${uniqueSlug('f')}`;
      const created = await createProduct(title);
      await http()
        .post(`/api/admin/products/${created.body.id}/approve`)
        .set(bearer(admin.token))
        .expect(200);

      await vi.waitFor(async () => {
        const res = await http()
          .get(`/api/search?q=${encodeURIComponent(title)}&categoryId=${rootCategoryId}`)
          .expect(200);
        expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([created.body.id]);
      }, WAIT);
    });
  });

  describe('maintenance', () => {
    it('removes only expired technical records', async () => {
      const day = 24 * 60 * 60 * 1000;
      const ago = (days: number) => new Date(Date.now() - days * day);
      const event = (publishedAt: Date | null) => ({
        type: 'product.changed',
        aggregateType: 'product',
        aggregateId: randomUUID(),
        payload: {},
        publishedAt,
      });
      const [oldEvent, freshEvent, pendingEvent] = await Promise.all([
        prisma.outboxEvent.create({ data: event(ago(8)) }),
        prisma.outboxEvent.create({ data: event(ago(1)) }),
        prisma.outboxEvent.create({ data: event(null) }),
      ]);
      const oldProcessedId = randomUUID();
      const freshProcessedId = randomUUID();
      await prisma.processedEvent.createMany({
        data: [
          { consumer: 'notifications', eventId: oldProcessedId, processedAt: ago(31) },
          { consumer: 'notifications', eventId: freshProcessedId, processedAt: ago(1) },
        ],
      });
      const token = (expiresAt: Date, revokedAt: Date | null) => ({
        userId: seller.userId,
        tokenHash: randomUUID(),
        familyId: randomUUID(),
        expiresAt,
        revokedAt,
      });
      const [expired, longRevoked, active] = await Promise.all([
        prisma.refreshToken.create({ data: token(ago(1), null) }),
        prisma.refreshToken.create({ data: token(ago(-7), ago(8)) }),
        prisma.refreshToken.create({ data: token(ago(-7), null) }),
      ]);

      await app.get(MaintenanceService).cleanup();

      const remainingEvents = await prisma.outboxEvent.findMany({
        where: { id: { in: [oldEvent.id, freshEvent.id, pendingEvent.id] } },
      });
      expect(remainingEvents.map((e) => e.id).sort()).toEqual(
        [freshEvent.id, pendingEvent.id].sort(),
      );
      const remainingProcessed = await prisma.processedEvent.findMany({
        where: { eventId: { in: [oldProcessedId, freshProcessedId] } },
      });
      expect(remainingProcessed.map((e) => e.eventId)).toEqual([freshProcessedId]);
      const remainingTokens = await prisma.refreshToken.findMany({
        where: { id: { in: [expired.id, longRevoked.id, active.id] } },
      });
      expect(remainingTokens.map((t) => t.id)).toEqual([active.id]);
    });
  });

  describe('idempotent consumers', () => {
    it('applies a duplicated event exactly once', async () => {
      const customer = await createActor(app, prisma, Role.CUSTOMER);
      const application = await http()
        .post('/api/seller-applications')
        .set(bearer(customer.token))
        .send({ storeName: `Idempotent ${uniqueSlug('i')}` })
        .expect(201);
      await http()
        .post(`/api/admin/seller-applications/${application.body.id}/approve`)
        .set(bearer(admin.token))
        .send({})
        .expect(200);

      const countNotifications = () =>
        prisma.notification.count({
          where: { userId: customer.userId, type: 'seller.approved' },
        });
      await vi.waitFor(async () => expect(await countNotifications()).toBe(1), WAIT);

      const row = await prisma.outboxEvent.findFirstOrThrow({
        where: { type: 'seller.approved', payload: { path: ['userId'], equals: customer.userId } },
      });
      const event: PublishedEvent = {
        id: row.id,
        type: 'seller.approved',
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        payload: row.payload as PublishedEvent['payload'],
        correlationId: row.correlationId,
        occurredAt: row.createdAt.toISOString(),
      };
      const processor = app.get(NotificationsProcessor);
      await Promise.all([
        processor.handle(event),
        processor.handle(event),
        processor.handle(event),
      ]);
      expect(await countNotifications()).toBe(1);

      await prisma.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: null } });
      await vi.waitFor(async () => {
        const republished = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
        expect(republished.publishedAt).not.toBeNull();
      }, WAIT);
      expect(await countNotifications()).toBe(1);

      await http().get('/api/notifications').set(bearer(customer.token)).expect(401);
      const sellerToken = await loginAs(app, customer.email);
      const notifications = await http()
        .get('/api/notifications')
        .set(bearer(sellerToken))
        .expect(200);
      expect(notifications.body).toHaveLength(1);
    });
  });
});

describe('Search graceful degradation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const failingIndex = {
    ensureReady: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
    count: vi.fn(),
    allIds: vi.fn(),
    search: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      overrides: [{ token: SEARCH_INDEX, value: failingIndex }],
    }));
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('serves results from Postgres and opens the circuit after repeated failures', async () => {
    const seller = await createActor(app, prisma, Role.SELLER);
    const category = await prisma.category.create({
      data: { name: 'E2E Fallback', slug: uniqueSlug('fallback') },
    });
    const title = `Fallback ${uniqueSlug('fb')}`;
    const product = await prisma.product.create({
      data: {
        sellerId: seller.sellerId!,
        categoryId: category.id,
        title,
        description: 'Served without search engine',
        priceMinor: 10_000,
        stock: 1,
        status: ProductStatus.ACTIVE,
      },
    });

    const responses = [];
    for (let i = 0; i < 6; i++) {
      responses.push(
        await request(app.getHttpServer())
          .get(`/api/search?q=${encodeURIComponent(title)}`)
          .expect(200),
      );
    }

    for (const res of responses) {
      expect(res.body).toMatchObject({ source: 'database', degraded: true, total: 1 });
      expect(res.body.items[0]).toMatchObject({ id: product.id, sellerId: seller.sellerId });
    }
    expect(failingIndex.search).toHaveBeenCalledTimes(3);
  });
});
