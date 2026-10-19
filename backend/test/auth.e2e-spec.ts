import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AccessTokenRevocationService } from '../src/modules/auth/access-token-revocation.service.js';
import {
  cleanupE2eData,
  createTestApp,
  loginAs,
  PASSWORD,
  registerUser,
  RoleProbeController,
  uniqueEmail,
} from './helpers.js';

const refreshCookie = (cookies: string[]) =>
  cookies.find((cookie) => cookie.startsWith('refresh_token='));

const cookiePair = (cookies: string[]) => refreshCookie(cookies)!.split(';')[0];

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp([RoleProbeController]));
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('register', () => {
    it('creates a customer and returns tokens with an httpOnly refresh cookie', async () => {
      const { email, body, cookies } = await registerUser(app);

      expect(body.user).toMatchObject({ email, role: Role.CUSTOMER });
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBe(900);
      expect(body).not.toHaveProperty('refreshToken');
      expect(refreshCookie(cookies)).toMatch(/HttpOnly/);
      expect(refreshCookie(cookies)).toMatch(/SameSite=Lax/);
      expect(refreshCookie(cookies)).toMatch(/Path=\/api\/auth/);
    });

    it('normalizes the email', async () => {
      const email = uniqueEmail();
      await http()
        .post('/api/auth/register')
        .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD, name: 'Upper' })
        .expect(201)
        .expect(({ body }) => expect(body.user.email).toBe(email));
    });

    it('does not allow choosing a role', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, name: 'Hacker', role: 'ADMIN' })
        .expect(400);

      expect(res.body.message).toContain('property role should not exist');
    });

    it('rejects a duplicate email', async () => {
      const { email } = await registerUser(app);

      await http()
        .post('/api/auth/register')
        .send({ email, password: PASSWORD, name: 'Again' })
        .expect(409);
    });

    it('validates the payload', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: '' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'email must be an email',
          'password must be longer than or equal to 8 characters',
          'name must be longer than or equal to 1 characters',
        ]),
      );
    });
  });

  describe('login and me', () => {
    it('logs in and returns the current user', async () => {
      const { email } = await registerUser(app);
      const accessToken = await loginAs(app, email);

      const me = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(me.body).toMatchObject({ email, role: Role.CUSTOMER });
      expect(me.body).not.toHaveProperty('passwordHash');
    });

    it('returns the same error for a wrong password and an unknown email', async () => {
      const { email } = await registerUser(app);

      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword1' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('rejects requests without or with a forged access token', async () => {
      await http().get('/api/auth/me').expect(401);
      await http()
        .get('/api/auth/me')
        .set('Authorization', 'Bearer forged.token.value')
        .expect(401);
    });
  });

  describe('refresh token rotation', () => {
    const refresh = (cookie: string) => http().post('/api/auth/refresh').set('Cookie', cookie);

    it('rotates the refresh token from the httpOnly cookie only', async () => {
      const { body, cookies } = await registerUser(app);
      expect(body).not.toHaveProperty('refreshToken');

      const res = await refresh(cookiePair(cookies)).expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(cookiePair(res.get('Set-Cookie') ?? [])).not.toBe(cookiePair(cookies));
    });

    it('ignores a refresh token sent in the body', async () => {
      const { cookies } = await registerUser(app);
      const token = cookiePair(cookies).split('=')[1];

      await http().post('/api/auth/refresh').send({ refreshToken: token }).expect(401);
    });

    it('gives concurrent refreshes from two tabs their own tokens', async () => {
      const { cookies } = await registerUser(app);

      const results = await Promise.all([
        refresh(cookiePair(cookies)),
        refresh(cookiePair(cookies)),
      ]);

      expect(results.map((r) => r.status)).toEqual([200, 200]);
      for (const result of results) {
        await refresh(cookiePair(result.get('Set-Cookie') ?? [])).expect(200);
      }
    });

    it('treats a late reuse as theft and revokes the session and access tokens', async () => {
      const { body, cookies } = await registerUser(app);
      const first = cookiePair(cookies);
      const rotated = await refresh(first).expect(200);
      const second = cookiePair(rotated.get('Set-Cookie') ?? []);

      await prisma.refreshToken.updateMany({
        where: { userId: body.user.id, rotatedAt: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });

      await refresh(first).expect(401);
      await refresh(second).expect(401);
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${rotated.body.accessToken}`)
        .expect(401);
    });

    it('rejects a missing refresh cookie', async () => {
      await http().post('/api/auth/refresh').expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      const { cookies } = await registerUser(app);

      const res = await http()
        .post('/api/auth/logout')
        .set('Cookie', cookiePair(cookies))
        .expect(204);

      expect(refreshCookie(res.get('Set-Cookie') ?? [])).toMatch(/Expires=Thu, 01 Jan 1970/);
      await http().post('/api/auth/refresh').set('Cookie', cookiePair(cookies)).expect(401);
    });
  });

  describe('access token revocation', () => {
    it('rejects access tokens issued before a revocation and accepts new ones', async () => {
      const { email, body } = await registerUser(app);
      const before = body.accessToken as string;

      await app.get(AccessTokenRevocationService).revokeIssuedBeforeNow(body.user.id);

      const rejected = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${before}`)
        .expect(401);
      expect(rejected.body.message).toMatch(/outdated/);

      const fresh = await loginAs(app, email);
      await http().get('/api/auth/me').set('Authorization', `Bearer ${fresh}`).expect(200);
    });
  });

  describe('rate limiting', () => {
    it('blocks the 6th login attempt per minute for the same email', async () => {
      const email = uniqueEmail('bruteforce');
      for (let attempt = 0; attempt < 5; attempt++) {
        await http().post('/api/auth/login').send({ email, password: 'Wrong123!' }).expect(401);
      }

      const blocked = await http()
        .post('/api/auth/login')
        .send({ email, password: 'Wrong123!' })
        .expect(429);
      expect(blocked.headers['retry-after-login-email']).toBeDefined();

      const { email: other } = await registerUser(app);
      await loginAs(app, other);
    });
  });

  describe('role-based access', () => {
    it('applies @Roles to authenticated users', async () => {
      const { email } = await registerUser(app);
      const customerToken = await loginAs(app, email);

      await http()
        .get('/api/test-probe/authenticated')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      await http()
        .get('/api/test-probe/admin')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      await prisma.user.update({ where: { email }, data: { role: Role.ADMIN } });
      const adminToken = await loginAs(app, email);

      await http()
        .get('/api/test-probe/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await http()
        .get('/api/test-probe/seller')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('requires authentication before checking roles', async () => {
      await http().get('/api/test-probe/admin').expect(401);
    });
  });
});
