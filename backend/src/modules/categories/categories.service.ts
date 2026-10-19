import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { slugify } from '../../common/slug.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CategoriesRepository } from './categories.repository.js';
import type { CategoryDto, CreateCategoryDto, UpdateCategoryDto } from './categories.dto.js';
import { buildTree, CategoryNode, descendantIds, wouldCreateCycle } from './category-tree.js';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);
  private cache: { loadedAt: number; categories: Promise<CategoryNode[]> } | null = null;

  constructor(private readonly categories: CategoriesRepository) {}

  async tree() {
    return buildTree(await this.all());
  }

  async withDescendants(categoryId: string): Promise<string[]> {
    return [...descendantIds(await this.all(), categoryId)];
  }

  async assertExists(categoryId: string) {
    if (!(await this.categories.exists(categoryId))) {
      throw new BadRequestException('Category does not exist');
    }
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const slug = this.resolveSlug(dto.slug, dto.name);
    if (dto.parentId) {
      await this.assertExists(dto.parentId);
    }
    const category = await this.withSlugConflict(() =>
      this.categories.create({ name: dto.name, slug, parentId: dto.parentId ?? null }),
    );
    this.invalidate();
    this.logger.log({ categoryId: category.id }, 'Category created');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const categories = await this.load();
    if (!categories.some((category) => category.id === id)) {
      throw new NotFoundException('Category not found');
    }
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (!categories.some((category) => category.id === dto.parentId)) {
        throw new BadRequestException('Parent category does not exist');
      }
      if (wouldCreateCycle(categories, id, dto.parentId)) {
        throw new BadRequestException('Category cannot be moved under itself or its descendant');
      }
    }

    const updated = await this.withSlugConflict(() =>
      this.categories.update(id, { name: dto.name, slug: dto.slug, parentId: dto.parentId }),
    );
    this.invalidate();
    return updated;
  }

  async remove(id: string) {
    const category = await this.categories.usage(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (category._count.children > 0 || category._count.products > 0) {
      throw new ConflictException('Category has subcategories or products');
    }
    await this.categories.delete(id);
    this.invalidate();
    this.logger.log({ categoryId: id }, 'Category deleted');
  }

  all(): Promise<CategoryNode[]> {
    if (!this.cache || Date.now() - this.cache.loadedAt > CACHE_TTL_MS) {
      const categories = this.load();
      this.cache = { loadedAt: Date.now(), categories };
      categories.catch(() => this.invalidate());
    }
    return this.cache.categories;
  }

  invalidate() {
    this.cache = null;
  }

  private load(): Promise<CategoryNode[]> {
    return this.categories.findAll();
  }

  private resolveSlug(slug: string | undefined, name: string) {
    const resolved = slug ?? slugify(name);
    if (!resolved) {
      throw new BadRequestException('slug is required when the name has no latin characters');
    }
    return resolved;
  }

  private async withSlugConflict<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Category slug already exists');
      }
      throw error;
    }
  }
}
