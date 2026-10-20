import { createHash } from 'node:crypto';
import {
  authorizationUrl,
  createPkcePair,
  decideGoogleAccount,
  GoogleProfile,
  profileFromIdToken,
} from './google-oauth.rules.js';

const NOW = 1_800_000_000;
const expected = { clientId: 'client.apps.googleusercontent.com', nonce: 'n-1', nowSeconds: NOW };

const token = (claims: Record<string, unknown>) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: expected.clientId,
        exp: NOW + 600,
        nonce: 'n-1',
        sub: '1234',
        email: 'Jane.Doe@Gmail.com',
        email_verified: true,
        name: ' Jane Doe ',
        ...claims,
      }),
    ).toString('base64url'),
    'sig',
  ].join('.');

const profile = (overrides: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: 'g-1',
  email: 'jane@example.com',
  emailVerified: true,
  name: 'Jane',
  ...overrides,
});

describe('createPkcePair', () => {
  it('derives the S256 challenge from a fresh verifier', () => {
    const pair = createPkcePair();

    expect(pair.codeVerifier).toMatch(/^[\w-]{64}$/);
    expect(pair.codeChallenge).toBe(
      createHash('sha256').update(pair.codeVerifier).digest('base64url'),
    );
    expect(createPkcePair().state).not.toBe(pair.state);
  });
});

describe('authorizationUrl', () => {
  it('asks for an OpenID code with PKCE', () => {
    const url = new URL(
      authorizationUrl(
        { clientId: 'cid', callbackUrl: 'http://localhost:3001/cb' },
        { state: 's', nonce: 'n', codeChallenge: 'c' },
      ),
    );

    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'http://localhost:3001/cb',
      response_type: 'code',
      scope: 'openid email profile',
      state: 's',
      nonce: 'n',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  });
});

describe('profileFromIdToken', () => {
  it('reads a normalized profile from valid claims', () => {
    expect(profileFromIdToken(token({}), expected)).toEqual({
      sub: '1234',
      email: 'jane.doe@gmail.com',
      emailVerified: true,
      name: 'Jane Doe',
    });
  });

  it('accepts an audience list and falls back to the email name', () => {
    const result = profileFromIdToken(
      token({ aud: ['other', expected.clientId], name: undefined, email_verified: 'true' }),
      expected,
    );
    expect(result).toMatchObject({ name: 'jane.doe', emailVerified: true });
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example' }, /issuer/],
    ['another client', { aud: 'other-client' }, /another client/],
    ['an expired token', { exp: NOW - 120 }, /expired/],
    ['a replayed nonce', { nonce: 'other' }, /nonce/],
    ['no subject', { sub: '' }, /subject/],
    ['no email', { email: undefined }, /no email/],
  ])('rejects %s', (_, claims, message) => {
    expect(() => profileFromIdToken(token(claims), expected)).toThrow(message);
  });

  it('tolerates small clock skew', () => {
    expect(() => profileFromIdToken(token({ exp: NOW - 30 }), expected)).not.toThrow();
  });

  it('rejects malformed tokens', () => {
    expect(() => profileFromIdToken('not-a-jwt', expected)).toThrow(/Malformed/);
    expect(() => profileFromIdToken('a.!!!.c', expected)).toThrow(/Malformed/);
  });
});

describe('decideGoogleAccount', () => {
  const existing = { id: 'u-1', googleId: null };

  it('logs in a user already linked to this Google account', () => {
    const linked = { id: 'u-2', googleId: 'g-1' };
    expect(decideGoogleAccount(profile({ emailVerified: false }), linked, null)).toEqual({
      action: 'login',
      user: linked,
    });
  });

  it('links a verified email to the existing password account', () => {
    expect(decideGoogleAccount(profile(), null, existing)).toEqual({
      action: 'link',
      user: existing,
    });
  });

  it('creates a new account for an unknown verified email', () => {
    expect(decideGoogleAccount(profile(), null, null)).toEqual({ action: 'create' });
  });

  it('never merges or creates accounts from unverified emails', () => {
    expect(() => decideGoogleAccount(profile({ emailVerified: false }), null, existing)).toThrow(
      expect.objectContaining({ code: 'email_unverified' }),
    );
    expect(() => decideGoogleAccount(profile({ emailVerified: false }), null, null)).toThrow(
      expect.objectContaining({ code: 'email_unverified' }),
    );
  });

  it('refuses to replace another Google account on the same email', () => {
    expect(() => decideGoogleAccount(profile(), null, { id: 'u-1', googleId: 'g-other' })).toThrow(
      expect.objectContaining({ code: 'account_conflict' }),
    );
  });
});
