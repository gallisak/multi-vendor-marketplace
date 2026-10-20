import { Controller, Get, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Roles } from '../src/common/auth/decorators.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { WorkerModule } from '../src/worker.module.js';

export const PASSWORD = 'Password123!';
export const E2E_EMAIL_DOMAIN = '@e2e.test';
export const E2E_SLUG_PREFIX = 'e2e-';

@Controller('test-probe')
export class RoleProbeController {
  @Get('authenticated')
  authenticated() {
    return { ok: true };
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Roles(Role.SELLER, Role.ADMIN)
  @Get('seller')
  seller() {
    return { ok: true };
  }
}

export interface TestAppOptions {
  controllers?: Type[];
  withWorker?: boolean;
  overrides?: { token: unknown; value: unknown }[];
}

export async function createTestApp(options: TestAppOptions | Type[] = {}) {
  const {
    controllers = [],
    withWorker = false,
    overrides = [],
  } = Array.isArray(options) ? { controllers: options } : options;
  let builder = Test.createTestingModule({
    imports: withWorker ? [AppModule, WorkerModule] : [AppModule],
    controllers,
  });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID()}${E2E_EMAIL_DOMAIN}`;

export const uniqueSlug = (prefix = 'cat') =>
  `${E2E_SLUG_PREFIX}${prefix}-${randomUUID().slice(0, 8)}`;

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function registerUser(app: INestApplication, email = uniqueEmail()) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'E2E User' })
    .expect(201);
  return { email, body: res.body, cookies: res.get('Set-Cookie') ?? [] };
}

export async function loginAs(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

export interface TestActor {
  userId: string;
  email: string;
  token: string;
  sellerId?: string;
}

export async function createActor(
  app: INestApplication,
  prisma: PrismaService,
  role: Role,
): Promise<TestActor> {
  const { email, body } = await registerUser(app, uniqueEmail(role.toLowerCase()));
  const userId = body.user.id as string;
  let sellerId: string | undefined;

  if (role !== Role.CUSTOMER) {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  }
  if (role === Role.SELLER) {
    const seller = await prisma.seller.create({
      data: { userId, storeName: `E2E Store ${randomUUID().slice(0, 8)}` },
    });
    sellerId = seller.id;
  }

  return { userId, email, token: await loginAs(app, email), sellerId };
}

export async function cleanupE2eData(prisma: PrismaService) {
  const e2eUsers = { email: { endsWith: E2E_EMAIL_DOMAIN } };
  await prisma.ledgerEntry.deleteMany({ where: { seller: { user: e2eUsers } } });
  await prisma.payout.deleteMany({ where: { seller: { user: e2eUsers } } });
  await prisma.order.deleteMany({
    where: {
      OR: [{ buyer: e2eUsers }, { sellerOrders: { some: { seller: { user: e2eUsers } } } }],
    },
  });
  await prisma.product.deleteMany({ where: { seller: { user: e2eUsers } } });
  await prisma.seller.deleteMany({ where: { user: e2eUsers } });
  await prisma.sellerApplication.deleteMany({ where: { user: e2eUsers } });
  let deleted: number;
  do {
    ({ count: deleted } = await prisma.category.deleteMany({
      where: { slug: { startsWith: E2E_SLUG_PREFIX }, children: { none: {} } },
    }));
  } while (deleted > 0);
  await prisma.user.deleteMany({ where: e2eUsers });
  await prisma.outboxEvent.deleteMany({});
  await prisma.processedEvent.deleteMany({});
}
