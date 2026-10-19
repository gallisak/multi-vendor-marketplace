import { withTimeout } from './dependencies.health.js';

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('pong'), 50)).resolves.toBe('pong');
  });

  it('rejects when the promise hangs', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20)).rejects.toThrow(
      'Timed out after 20ms',
    );
  });
});
