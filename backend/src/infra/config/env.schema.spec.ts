import { validateEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://mvm:mvm@localhost:5433/mvm',
  REDIS_URL: 'redis://localhost:6379',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_MASTER_KEY: 'key',
  JWT_ACCESS_SECRET: 'a'.repeat(16),
  JWT_REFRESH_SECRET: 'b'.repeat(16),
};

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...validEnv, API_PORT: '3001' });

    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PLATFORM_COMMISSION_PERCENT).toBe(10);
  });

  it('lists every invalid variable', () => {
    expect(() =>
      validateEnv({ ...validEnv, DATABASE_URL: 'nope', JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects commission outside 0..100', () => {
    expect(() => validateEnv({ ...validEnv, PLATFORM_COMMISSION_PERCENT: '150' })).toThrow(
      /PLATFORM_COMMISSION_PERCENT/,
    );
  });
});

describe('validateEnv in production', () => {
  const strong = (char: string) => char.repeat(40);

  it('rejects placeholder and short secrets', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'dev-access-secret-change-me-please-now',
        MEILI_MASTER_KEY: 'short',
      }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET[\s\S]*MEILI_MASTER_KEY/);
  });

  it('accepts unique long secrets', () => {
    const env = validateEnv({
      ...validEnv,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: strong('a'),
      JWT_REFRESH_SECRET: strong('b'),
      MEILI_MASTER_KEY: strong('c'),
    });

    expect(env.NODE_ENV).toBe('production');
  });

  it('parses LOG_PRETTY as a boolean flag', () => {
    expect(validateEnv({ ...validEnv, LOG_PRETTY: 'true' }).LOG_PRETTY).toBe(true);
    expect(validateEnv(validEnv).LOG_PRETTY).toBe(false);
  });
});
