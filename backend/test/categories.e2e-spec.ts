import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  TestActor,
  uniqueSlug,
} from './helpers.js';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestActor;
  const http = () => request(app.getHttpServer());

  const createCategory = (body: Record<string, unknown>) =>
    http().post('/api/admin/categories').set(bearer(admin.token)).send(body);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createActor(app, prisma, Role.ADMIN);
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('builds a public tree from admin-managed categories', async () => {
    const rootSlug = uniqueSlug('root');
    const root = await createCategory({ name: 'Root', slug: rootSlug }).expect(201);
    const child = await createCategory({
      name: 'Child',
      slug: uniqueSlug('child'),
      parentId: root.body.id,
    }).expect(201);

    const tree = await http().get('/api/categories').expect(200);
    const node = tree.body.find((c: { slug: string }) => c.slug === rootSlug);
    expect(node.children.map((c: { id: string }) => c.id)).toEqual([child.body.id]);
  });

  it('generates a slug from the name and rejects duplicates', async () => {
    const name = `E2E ${uniqueSlug('auto')}`;
    const created = await createCategory({ name }).expect(201);
    expect(created.body.slug).toBe(name.toLowerCase().replace(/ /g, '-'));

    await createCategory({ name: 'Other', slug: created.body.slug }).expect(409);
    await createCategory({ name: 'Книги' }).expect(400);
  });

  it('prevents cycles when moving a category', async () => {
    const parent = await createCategory({ name: 'Parent', slug: uniqueSlug('p') }).expect(201);
    const child = await createCategory({
      name: 'Child',
      slug: uniqueSlug('c'),
      parentId: parent.body.id,
    }).expect(201);

    await http()
      .patch(`/api/admin/categories/${parent.body.id}`)
      .set(bearer(admin.token))
      .send({ parentId: child.body.id })
      .expect(400);
    await http()
      .patch(`/api/admin/categories/${child.body.id}`)
      .set(bearer(admin.token))
      .send({ parentId: null, name: 'Moved to root' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ parentId: null, name: 'Moved to root' }));
  });

  it('refuses to delete a category that still has subcategories', async () => {
    const parent = await createCategory({ name: 'Busy', slug: uniqueSlug('busy') }).expect(201);
    const child = await createCategory({
      name: 'Leaf',
      slug: uniqueSlug('leaf'),
      parentId: parent.body.id,
    }).expect(201);

    await http()
      .delete(`/api/admin/categories/${parent.body.id}`)
      .set(bearer(admin.token))
      .expect(409);
    await http()
      .delete(`/api/admin/categories/${child.body.id}`)
      .set(bearer(admin.token))
      .expect(204);
    await http()
      .delete(`/api/admin/categories/${parent.body.id}`)
      .set(bearer(admin.token))
      .expect(204);
  });

  it('is managed by admins only', async () => {
    const seller = await createActor(app, prisma, Role.SELLER);

    await http()
      .post('/api/admin/categories')
      .set(bearer(seller.token))
      .send({ name: 'Nope', slug: uniqueSlug('nope') })
      .expect(403);
  });
});
