import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Redis } from 'ioredis';
import type { Counter } from 'prom-client';
import { googleAccountLinked } from '../../../common/events/domain-events.js';
import type { User } from '../../../generated/prisma/client.js';
import type { Env } from '../../../infra/config/env.schema.js';
import { METRIC } from '../../../infra/metrics/metric-names.js';
import { OutboxService } from '../../../infra/outbox/outbox.service.js';
import { UnitOfWork } from '../../../infra/prisma/unit-of-work.js';
import { REDIS } from '../../../infra/redis/redis.module.js';
import type { AuthResult } from '../auth.service.js';
import { AccessTokenRevocationService } from '../access-token-revocation.service.js';
import { UsersRepository } from '../../users/users.repository.js';
import { RefreshTokensRepository } from '../refresh-tokens.repository.js';
import { TokenService } from '../token.service.js';
import {
  authorizationUrl,
  createPkcePair,
  decideGoogleAccount,
  GoogleProfile,
  GoogleSignInError,
  profileFromIdToken,
} from './google-oauth.rules.js';
import { GOOGLE_TOKEN_CLIENT, type GoogleTokenClient } from './google-token.client.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `oauth:google:${state}`;

interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

interface PendingSignIn {
  codeVerifier: string;
  nonce: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client: GoogleClientConfig | null;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly tokens: TokenService,
    private readonly revocation: AccessTokenRevocationService,
    private readonly outbox: OutboxService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(GOOGLE_TOKEN_CLIENT) private readonly tokenClient: GoogleTokenClient,
    @InjectMetric(METRIC.oauthSignIns) private readonly signIns: Counter<string>,
    config: ConfigService<Env, true>,
  ) {
    const clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    const callbackUrl = config.get('GOOGLE_CALLBACK_URL', { infer: true });
    this.client =
      clientId && clientSecret && callbackUrl ? { clientId, clientSecret, callbackUrl } : null;
  }

  get enabled() {
    return this.client !== null;
  }

  async start(): Promise<{ url: string; state: string }> {
    const client = this.requireClient();
    const pkce = createPkcePair();
    const pending: PendingSignIn = { codeVerifier: pkce.codeVerifier, nonce: pkce.nonce };
    await this.redis.set(stateKey(pkce.state), JSON.stringify(pending), 'EX', STATE_TTL_SECONDS);
    return { url: authorizationUrl(client, pkce), state: pkce.state };
  }

  async complete(input: {
    state?: string;
    code?: string;
    cookieState?: string;
  }): Promise<AuthResult & { linked: boolean }> {
    try {
      const result = await this.signIn(input);
      this.signIns.inc({ outcome: result.linked ? 'linked' : 'success' });
      return result;
    } catch (error) {
      this.signIns.inc({
        outcome: error instanceof GoogleSignInError ? error.code : 'oauth_failed',
      });
      throw error;
    }
  }

  private async signIn({
    state,
    code,
    cookieState,
  }: {
    state?: string;
    code?: string;
    cookieState?: string;
  }) {
    const client = this.requireClient();
    if (!state || !cookieState || state !== cookieState) {
      throw new GoogleSignInError('oauth_state', 'Sign-in state does not match this browser');
    }
    const stored = await this.redis.getdel(stateKey(state));
    if (!stored) {
      throw new GoogleSignInError('oauth_state', 'Sign-in request expired or was already used');
    }
    if (!code) {
      throw new GoogleSignInError('oauth_failed', 'Google did not return an authorization code');
    }

    const pending = JSON.parse(stored) as PendingSignIn;
    const idToken = await this.tokenClient.exchangeCode({
      code,
      codeVerifier: pending.codeVerifier,
      ...client,
    });
    const profile = profileFromIdToken(idToken, {
      clientId: client.clientId,
      nonce: pending.nonce,
      nowSeconds: Math.floor(Date.now() / 1000),
    });

    const { user, linked } = await this.findOrCreateUser(profile);
    if (linked) {
      await this.revocation.revokeIssuedBeforeNow(user.id);
    }
    this.logger.log({ userId: user.id, linked }, 'User signed in with Google');
    return { user, tokens: await this.tokens.issue(user), linked };
  }

  private async findOrCreateUser(
    profile: GoogleProfile,
    attempt = 1,
  ): Promise<{ user: User; linked: boolean }> {
    try {
      return await this.uow.run(async (tx) => {
        const [byGoogleId, byEmail] = await Promise.all([
          this.users.findByGoogleId(profile.sub, tx),
          this.users.findByEmail(profile.email, tx),
        ]);
        const decision = decideGoogleAccount(profile, byGoogleId, byEmail);

        switch (decision.action) {
          case 'login':
            return { user: decision.user, linked: false };
          case 'create': {
            const user = await this.users.create(
              { email: profile.email, name: profile.name, googleId: profile.sub },
              tx,
            );
            this.logger.log({ userId: user.id }, 'User registered with Google');
            return { user, linked: false };
          }
          case 'link': {
            if (!(await this.users.linkGoogleAccount(decision.user.id, profile.sub, tx))) {
              throw new GoogleSignInError('account_conflict', 'Account was linked concurrently');
            }
            await this.refreshTokens.revokeAllForUser(decision.user.id, tx);
            await this.outbox.add(
              tx,
              googleAccountLinked({
                userId: decision.user.id,
                email: profile.email,
                passwordRemoved: decision.user.passwordHash !== null,
              }),
            );
            this.logger.warn(
              { userId: decision.user.id },
              'Google account linked to existing user, password and other sessions revoked',
            );
            return {
              user: { ...decision.user, googleId: profile.sub, passwordHash: null },
              linked: true,
            };
          }
        }
      });
    } catch (error) {
      if (attempt < 3 && isUniqueViolation(error)) {
        return this.findOrCreateUser(profile, attempt + 1);
      }
      throw error;
    }
  }

  private requireClient(): GoogleClientConfig {
    if (!this.client) {
      throw new GoogleSignInError('google_disabled', 'Google sign-in is not configured');
    }
    return this.client;
  }
}
