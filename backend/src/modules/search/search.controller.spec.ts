import { ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AdminSearchController, ENQUEUE_TIMEOUT_MS } from './search.controller.js';

describe('AdminSearchController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the scheduled job id', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: 'reindex-1' }) } as unknown as Queue;

    await expect(new AdminSearchController(queue).reindex()).resolves.toEqual({
      jobId: 'reindex-1',
    });
  });

  it('answers 503 instead of hanging when the queue is unreachable', async () => {
    vi.useFakeTimers();
    const queue = { add: vi.fn(() => new Promise(() => undefined)) } as unknown as Queue;

    const result = new AdminSearchController(queue).reindex();
    const assertion = expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);

    await assertion;
  });
});
