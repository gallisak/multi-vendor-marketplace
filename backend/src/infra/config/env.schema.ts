import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DURATION_PATTERN } from '../../common/duration.js';

const duration = (fallback: string) =>
  z.string().regex(DURATION_PATTERN, 'expected duration like 900, 15m, 7d').default(fallback);

const PRODUCTION_SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MEILI_MASTER_KEY'] as const;
const INSECURE_SECRET = /change-me/i;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: z.stringbool().default(false),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    LOGIN_IP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    MEILI_HOST: z.url(),
    MEILI_MASTER_KEY: z.string().min(1),
    MEILI_INDEX_PREFIX: z.string().default(''),
    SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),

    WORKER_PORT: z.coerce.number().int().positive().default(3002),
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(500),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),

    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_ACCESS_TTL: duration('15m'),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_REFRESH_TTL: duration('7d'),
    REFRESH_ROTATION_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.url().optional(),
    CATALOG_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    CATALOG_LIST_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(10),

    PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(10),
    PAYMENT_MOCK_DECLINE_ABOVE_MINOR: z.coerce.number().int().positive().default(50_000_000),
    PAYOUT_HOLD: duration('7d'),
    PAYOUT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    AUCTION_CHECKOUT_WINDOW: duration('24h'),
    AUCTION_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    BID_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
    REALTIME_AUTH_RECHECK_MS: z.coerce.number().int().min(100).default(30_000),
  })
  .transform((env) => ({
    ...env,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET || undefined,
  }))
  .superRefine((env, ctx) => {
    const google = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET];
    if (google.some(Boolean) && !google.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
      });
    }
    if (google.every(Boolean) && !env.GOOGLE_CALLBACK_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CALLBACK_URL'],
        message: 'is required when Google sign-in is configured',
      });
    }
    if (env.NODE_ENV !== 'production') {
      return;
    }
    for (const key of PRODUCTION_SECRETS) {
      if (env[key].length < 32 || INSECURE_SECRET.test(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'must be a unique secret of at least 32 characters in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

const repoRoot = new URL('../../../../', import.meta.url);

export function envFilePaths(nodeEnv = process.env.NODE_ENV ?? 'development'): string[] {
  return [`.env.${nodeEnv}`, '.env'].map((name) => fileURLToPath(new URL(name, repoRoot)));
}
