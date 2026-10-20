import { tolerantPublisher } from './realtime-publisher.js';

describe('tolerantPublisher', () => {
  it('passes messages through to Redis', async () => {
    const publish = vi.fn().mockResolvedValue(2);

    expect(await tolerantPublisher({ publish }).publish('room', 'payload')).toBe(2);
    expect(publish).toHaveBeenCalledWith('room', 'payload');
  });

  it('drops a message instead of crashing the worker when Redis is unreachable', async () => {
    const publish = vi.fn().mockRejectedValue(new Error("Stream isn't writeable"));

    await expect(tolerantPublisher({ publish }).publish('room', 'payload')).resolves.toBe(0);
  });
});
