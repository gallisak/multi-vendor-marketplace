import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  GOOGLE_TOKEN_CLIENT,
  type CodeExchange,
  type GoogleTokenClient,
} from '../src/modules/auth/google/google-token.client.js';
import {
  bearer,
  cleanupE2eData,
  createActor,
  createTestApp,
  PASSWORD,
  uniqueEmail,
} from './helpers.js';

const CLIENT_ID = 'e2e-client.apps.googleusercontent.com';
const FRONTEND = 'http://localhost:5173';
const WAIT = { timeout: 15_000, interval: 100 };

interface Claims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  aud?: string;
  nonce?: string;
}

class FakeGoogle implements GoogleTokenClient {
  readonly idTokens = new Map<string, string>();
  readonly exchanges: CodeExchange[] = [];

  exchangeCode(exchange: CodeExchange) {
    this.exchanges.push(exchange);
    const idToken = this.idTokens.get(exchange.code);
    return idToken ? Promise.resolve(idToken) : Promise.reject(new Error('invalid_grant'));
  }
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

const idToken = (claims: Claims, nonce: string) =>
  [
    encode({ alg: 'RS256', typ: 'JWT' }),
    encode({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email_verified: true,
      name: 'Google User',
      nonce,
      ...claims,
    }),
    'signature',
  ].join('.');

const cookieValue = (cookies: string[], name: string) =>
  cookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(';')[0]
    .slice(name.length + 1);

describe('Google sign-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const google = new FakeGoogle();
  const http = () => request(app.getHttpServer());

  const start = async () => {
    const res = await http().get('/api/auth/google').expect(302);
    const location = new URL(res.headers.location);
    const cookies = res.get('Set-Cookie') ?? [];
    return {
      location,
      cookies,
      state: location.searchParams.get('state')!,
      nonce: location.searchParams.get('nonce')!,
      stateCookie: cookieValue(cookies, 'oauth_state')!,
    };
  };

  const callback = (query: Record<string, string>, stateCookie?: string) => {
    const req = http().get(`/api/auth/google/callback?${new URLSearchParams(query).toString()}`);
    return stateCookie ? req.set('Cookie', `oauth_state=${stateCookie}`) : req;
  };

  const signIn = async (claims: Claims) => {
    const flow = await start();
    const code = randomUUID();
    google.idTokens.set(code, idToken(claims, claims.nonce ?? flow.nonce));
    const res = await callback(
      { state: flow.state, code, scope: 'openid email profile', authuser: '0' },
      flow.stateCookie,
    ).expect(302);
    return {
      flow,
      code,
      location: new URL(res.headers.location),
      refreshCookie: cookieValue(res.get('Set-Cookie') ?? [], 'refresh_token'),
    };
  };

  const refresh = (refreshCookie: string) =>
    http().post('/api/auth/refresh').set('Cookie', `refresh_token=${refreshCookie}`);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      withWorker: true,
      overrides: [{ token: GOOGLE_TOKEN_CLIENT, value: google }],
    }));
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  it('advertises the available sign-in methods', async () => {
    await http()
      .get('/api/auth/providers')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ password: true, google: true }));
  });

  it('redirects to Google with PKCE and binds the state to the browser', async () => {
    const flow = await start();

    expect(flow.location.origin + flow.location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(Object.fromEntries(flow.location.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: 'http://localhost:3099/api/auth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
    });
    expect(flow.location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(flow.stateCookie).toBe(flow.state);
    const stateCookie = flow.cookies.find((c) => c.startsWith('oauth_state='))!;
    expect(stateCookie).toMatch(/HttpOnly/);
    expect(stateCookie).toMatch(/Path=\/api\/auth\/google/);
  });

  it('creates a customer for a new Google account and lets the frontend refresh into a session', async () => {
    const email = uniqueEmail('google');
    const sub = `google-${randomUUID()}`;

    const first = await signIn({ sub, email: email.toUpperCase(), name: 'New Googler' });

    expect(`${first.location.origin}${first.location.pathname}`).toBe(`${FRONTEND}/auth/callback`);
    expect(first.location.searchParams.has('linked')).toBe(false);
    expect(google.exchanges.at(-1)).toMatchObject({ code: first.code, clientId: CLIENT_ID });
    expect(google.exchanges.at(-1)!.codeVerifier).toMatch(/^[\w-]{64}$/);

    const session = await refresh(first.refreshCookie!).expect(200);
    expect(session.body.user).toMatchObject({ email, name: 'New Googler', role: Role.CUSTOMER });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ googleId: sub, passwordHash: null });

    await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(401);

    const again = await signIn({ sub, email });
    const second = await refresh(again.refreshCookie!).expect(200);
    expect(second.body.user.id).toBe(user.id);
  });

  it('links Google to an existing account and drops the unverified password', async () => {
    const actor = await createActor(app, prisma, Role.CUSTOMER);
    const login = await http()
      .post('/api/auth/login')
      .send({ email: actor.email, password: PASSWORD })
      .expect(200);
    const oldRefresh = cookieValue(login.get('Set-Cookie') ?? [], 'refresh_token')!;
    const sub = `google-${randomUUID()}`;

    const linked = await signIn({ sub, email: actor.email });

    expect(linked.location.searchParams.get('linked')).toBe('google');
    const session = await refresh(linked.refreshCookie!).expect(200);
    expect(session.body.user.id).toBe(actor.userId);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } })).toMatchObject({
      googleId: sub,
    });

    await http().get('/api/auth/me').set(bearer(actor.token)).expect(401);
    await http().get('/api/auth/me').set(bearer(session.body.accessToken)).expect(200);
    await refresh(oldRefresh).expect(401);
    await refresh(cookieValue(session.get('Set-Cookie') ?? [], 'refresh_token')!).expect(200);
    await http()
      .post('/api/auth/login')
      .send({ email: actor.email, password: PASSWORD })
      .expect(401);

    await vi.waitFor(async () => {
      const notifications = await prisma.notification.findMany({
        where: { userId: actor.userId, type: 'user.google_linked' },
      });
      expect(notifications.map((n) => n.payload)).toEqual([
        { email: actor.email, passwordRemoved: 'true' },
      ]);
    }, WAIT);
  });

  it('refuses to link when Google has not verified the email', async () => {
    const actor = await createActor(app, prisma, Role.CUSTOMER);

    const attempt = await signIn({
      sub: `google-${randomUUID()}`,
      email: actor.email,
      email_verified: false,
    });

    expect(`${attempt.location.pathname}?${attempt.location.searchParams}`).toBe(
      '/login?error=email_unverified',
    );
    expect(attempt.refreshCookie).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    expect(user.googleId).toBeNull();
  });

  it('refuses to attach a second Google account to the same email', async () => {
    const email = uniqueEmail('google');
    await signIn({ sub: `google-${randomUUID()}`, email });

    const attempt = await signIn({ sub: `google-${randomUUID()}`, email });

    expect(attempt.location.searchParams.get('error')).toBe('account_conflict');
  });

  it('rejects forged, replayed and foreign sign-in attempts', async () => {
    const email = uniqueEmail('google');
    const flow = await start();
    const code = randomUUID();
    google.idTokens.set(code, idToken({ sub: `google-${randomUUID()}`, email }, flow.nonce));

    const errorOf = async (res: request.Test) =>
      new URL((await res.expect(302)).headers.location).searchParams.get('error');

    expect(await errorOf(callback({ state: flow.state, code }))).toBe('oauth_state');
    expect(await errorOf(callback({ state: flow.state, code }, 'other-state'))).toBe('oauth_state');
    expect(await errorOf(callback({ state: flow.state, code }, flow.stateCookie))).toBeNull();
    expect(await errorOf(callback({ state: flow.state, code }, flow.stateCookie))).toBe(
      'oauth_state',
    );

    const wrongNonce = await signIn({ sub: `google-${randomUUID()}`, email, nonce: 'forged' });
    expect(wrongNonce.location.searchParams.get('error')).toBe('oauth_failed');
    const otherClient = await signIn({
      sub: `google-${randomUUID()}`,
      email,
      aud: 'someone-else.apps.googleusercontent.com',
    });
    expect(otherClient.location.searchParams.get('error')).toBe('oauth_failed');

    const unknownCode = await start();
    expect(
      await errorOf(
        callback({ state: unknownCode.state, code: 'not-issued' }, unknownCode.stateCookie),
      ),
    ).toBe('oauth_failed');

    const cancelled = await start();
    expect(
      await errorOf(
        callback({ state: cancelled.state, error: 'access_denied' }, cancelled.stateCookie),
      ),
    ).toBe('oauth_cancelled');
  });

  it('creates one account when the same Google user signs in twice at once', async () => {
    const email = uniqueEmail('google');
    const sub = `google-${randomUUID()}`;

    const results = await Promise.all([signIn({ sub, email }), signIn({ sub, email })]);

    expect(results.map((r) => r.location.pathname)).toEqual(['/auth/callback', '/auth/callback']);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});
