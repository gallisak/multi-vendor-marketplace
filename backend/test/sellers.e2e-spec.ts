import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  loginAs,
  TestActor,
  uniqueSlug,
} from './helpers.js';

describe('Seller applications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestActor;
  const http = () => request(app.getHttpServer());

  const storeName = () => `Store ${uniqueSlug('s')}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createActor(app, prisma, Role.ADMIN);
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('turns an approved customer into a seller who can list products', async () => {
    const customer = await createActor(app, prisma, Role.CUSTOMER);
    const name = storeName();

    const application = await http()
      .post('/api/seller-applications')
      .set(bearer(customer.token))
      .send({ storeName: name, description: 'Handmade goods' })
      .expect(201);
    expect(application.body.status).toBe('PENDING');

    await http()
      .post('/api/seller-applications')
      .set(bearer(customer.token))
      .send({ storeName: storeName() })
      .expect(409);

    const pending = await http()
      .get('/api/admin/seller-applications?status=PENDING&limit=100')
      .set(bearer(admin.token))
      .expect(200);
    expect(pending.body.items.map((a: { id: string }) => a.id)).toContain(application.body.id);

    await http()
      .post(`/api/admin/seller-applications/${application.body.id}/approve`)
      .set(bearer(admin.token))
      .send({ note: 'Welcome' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('APPROVED'));

    await http()
      .post(`/api/admin/seller-applications/${application.body.id}/approve`)
      .set(bearer(admin.token))
      .send({})
      .expect(409);

    const seller = await prisma.seller.findUniqueOrThrow({ where: { userId: customer.userId } });
    expect(seller.storeName).toBe(name);

    await http()
      .get('/api/seller/products')
      .set(bearer(customer.token))
      .expect(401)
      .expect(({ body }) => expect(body.message).toMatch(/outdated/));

    const sellerToken = await loginAs(app, customer.email);
    await http()
      .get('/api/auth/me')
      .set(bearer(sellerToken))
      .expect(({ body }) => expect(body.role).toBe('SELLER'));
    await http().get('/api/seller/products').set(bearer(sellerToken)).expect(200);

    await http()
      .get(`/api/sellers/${seller.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.storeName).toBe(name));
  });

  it('does not demote a user who is no longer a customer', async () => {
    const customer = await createActor(app, prisma, Role.CUSTOMER);
    const application = await http()
      .post('/api/seller-applications')
      .set(bearer(customer.token))
      .send({ storeName: storeName() })
      .expect(201);
    await prisma.user.update({ where: { id: customer.userId }, data: { role: Role.ADMIN } });

    await http()
      .post(`/api/admin/seller-applications/${application.body.id}/approve`)
      .set(bearer(admin.token))
      .send({})
      .expect(409);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: customer.userId } });
    expect(user.role).toBe(Role.ADMIN);
    expect(await prisma.seller.count({ where: { userId: customer.userId } })).toBe(0);
    const stillPending = await prisma.sellerApplication.findUniqueOrThrow({
      where: { id: application.body.id },
    });
    expect(stillPending.status).toBe('PENDING');
  });

  it('lets a rejected customer apply again', async () => {
    const customer = await createActor(app, prisma, Role.CUSTOMER);
    const first = await http()
      .post('/api/seller-applications')
      .set(bearer(customer.token))
      .send({ storeName: storeName() })
      .expect(201);

    await http()
      .post(`/api/admin/seller-applications/${first.body.id}/reject`)
      .set(bearer(admin.token))
      .send({})
      .expect(400);
    await http()
      .post(`/api/admin/seller-applications/${first.body.id}/reject`)
      .set(bearer(admin.token))
      .send({ note: 'Incomplete description' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'REJECTED' }));

    await http()
      .post('/api/seller-applications')
      .set(bearer(customer.token))
      .send({ storeName: storeName() })
      .expect(201);

    const own = await http().get('/api/seller-applications/me').set(bearer(customer.token));
    expect(own.body.map((a: { status: string }) => a.status)).toEqual(['PENDING', 'REJECTED']);
  });

  it('rejects a store name that is already taken by another seller', async () => {
    const seller = await createActor(app, prisma, Role.SELLER);
    const { storeName: taken } = await prisma.seller.findUniqueOrThrow({
      where: { id: seller.sellerId },
    });
    const customer = await createActor(app, prisma, Role.CUSTOMER);

    await http()
      .post('/api/seller-applications')
      .set(bearer(customer.token))
      .send({ storeName: taken.toUpperCase() })
      .expect(409);
  });

  it('allows only customers to apply and only admins to moderate', async () => {
    const seller = await createActor(app, prisma, Role.SELLER);
    const customer = await createActor(app, prisma, Role.CUSTOMER);

    await http()
      .post('/api/seller-applications')
      .set(bearer(seller.token))
      .send({ storeName: storeName() })
      .expect(403);
    await http().get('/api/admin/seller-applications').set(bearer(customer.token)).expect(403);
    await http().get('/api/admin/seller-applications').set(bearer(seller.token)).expect(403);
  });

  it('returns 404 for an unknown application', async () => {
    await http()
      .post('/api/admin/seller-applications/00000000-0000-7000-8000-000000000000/approve')
      .set(bearer(admin.token))
      .send({})
      .expect(404);
  });
});
