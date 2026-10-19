import type { CategoriesRepository } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';

const categories = [{ id: 'books', name: 'Books', slug: 'books', parentId: null }];

const setup = () => {
  const findMany = vi.fn().mockResolvedValue(categories);
  const repository = { findAll: findMany } as unknown as CategoriesRepository;
  const service = new CategoriesService(repository);
  return { service, findMany };
};

describe('CategoriesService cache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves repeated reads from memory', async () => {
    const { service, findMany } = setup();

    await service.tree();
    await service.withDescendants('books');
    await service.all();

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('reloads after invalidation', async () => {
    const { service, findMany } = setup();

    await service.all();
    service.invalidate();
    await service.all();

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('expires entries after 30 seconds', async () => {
    vi.useFakeTimers();
    const { service, findMany } = setup();

    await service.all();
    vi.advanceTimersByTime(30_001);
    await service.all();

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed load', async () => {
    const { service, findMany } = setup();
    findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(service.all()).rejects.toThrow('db down');
    await expect(service.all()).resolves.toEqual(categories);
  });
});
