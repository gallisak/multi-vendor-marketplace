import { TimeoutError, withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('pong'), 50)).resolves.toBe('pong');
  });

  it('rejects with a TimeoutError when the promise hangs', async () => {
    const result = withTimeout(new Promise(() => undefined), 20);

    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    await expect(result).rejects.toThrow('Timed out after 20ms');
  });

  it('propagates the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });
});
