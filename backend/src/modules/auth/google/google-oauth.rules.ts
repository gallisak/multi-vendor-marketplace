import { createHash, randomBytes } from 'node:crypto';

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const CLOCK_SKEW_SECONDS = 60;

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface PkcePair {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
}

export class GoogleSignInError extends Error {
  constructor(
    readonly code:
      'google_disabled' | 'oauth_state' | 'oauth_failed' | 'email_unverified' | 'account_conflict',
    message: string,
  ) {
    super(message);
  }
}

export function createPkcePair(): PkcePair {
  const codeVerifier = randomBytes(48).toString('base64url');
  return {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    codeVerifier,
    codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  };
}

export function authorizationUrl(
  client: { clientId: string; callbackUrl: string },
  pkce: Pick<PkcePair, 'state' | 'nonce' | 'codeChallenge'>,
): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state: pkce.state,
    nonce: pkce.nonce,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new GoogleSignInError('oauth_failed', 'Malformed ID token');
  }
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('not an object');
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new GoogleSignInError('oauth_failed', 'Malformed ID token');
  }
}

export function profileFromIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; nowSeconds: number },
): GoogleProfile {
  const claims = decodeJwtPayload(idToken);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.includes(claims.iss)) {
    throw new GoogleSignInError('oauth_failed', 'ID token issuer is not Google');
  }
  if (!audience.includes(expected.clientId)) {
    throw new GoogleSignInError('oauth_failed', 'ID token was issued for another client');
  }
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < expected.nowSeconds) {
    throw new GoogleSignInError('oauth_failed', 'ID token has expired');
  }
  if (claims.nonce !== expected.nonce) {
    throw new GoogleSignInError('oauth_failed', 'ID token nonce does not match');
  }
  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new GoogleSignInError('oauth_failed', 'ID token has no subject');
  }
  if (typeof claims.email !== 'string' || !claims.email.includes('@')) {
    throw new GoogleSignInError('oauth_failed', 'Google account has no email');
  }

  const email = claims.email.trim().toLowerCase();
  const name =
    typeof claims.name === 'string' && claims.name.trim()
      ? claims.name.trim().slice(0, 100)
      : email.split('@')[0];
  return {
    sub: claims.sub,
    email,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name,
  };
}

export interface LinkCandidate {
  id: string;
  googleId: string | null;
}

export type GoogleAccountDecision<U extends LinkCandidate> =
  { action: 'login'; user: U } | { action: 'link'; user: U } | { action: 'create' };

export function decideGoogleAccount<U extends LinkCandidate>(
  profile: GoogleProfile,
  byGoogleId: U | null,
  byEmail: U | null,
): GoogleAccountDecision<U> {
  if (byGoogleId) {
    return { action: 'login', user: byGoogleId };
  }
  if (!profile.emailVerified) {
    throw new GoogleSignInError(
      'email_unverified',
      'Google has not verified this email, so it cannot be used to sign in',
    );
  }
  if (!byEmail) {
    return { action: 'create' };
  }
  if (byEmail.googleId) {
    throw new GoogleSignInError(
      'account_conflict',
      'This email is already linked to another Google account',
    );
  }
  return { action: 'link', user: byEmail };
}
