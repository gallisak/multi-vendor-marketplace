import { MAX_RETRY_DELAY_MS, retryDelayMs, shouldLogFailure } from './relay-backoff.js';

describe('retryDelayMs', () => {
  it('doubles the delay with every consecutive failure', () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(500, n))).toEqual([500, 1000, 2000, 4000]);
  });

  it('caps the delay', () => {
    expect(retryDelayMs(500, 7)).toBe(MAX_RETRY_DELAY_MS);
    expect(retryDelayMs(500, 1000)).toBe(MAX_RETRY_DELAY_MS);
  });
});

describe('shouldLogFailure', () => {
  it('logs the first failure and then every tenth', () => {
    const logged = Array.from({ length: 30 }, (_, i) => i + 1).filter(shouldLogFailure);

    expect(logged).toEqual([1, 10, 20, 30]);
  });
});
