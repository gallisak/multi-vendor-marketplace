import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Page, toPage, toSkipTake } from '../../common/pagination.js';
import { ProductStatus } from '../../generated/prisma/enums.js';
import { CategoriesService } from '../categories/categories.service.js';
import { toProductDto } from './product.mapper.js';
import type { CatalogQueryDto, ProductDto, SimilarProductsQueryDto } from './products.dto.js';
import { ProductsRepository } from './products.repository.js';

export const LISTED_STATUSES = [ProductStatus.ACTIVE];
export const VIEWABLE_STATUSES = [ProductStatus.ACTIVE, ProductStatus.SOLD_OUT];

@Injectable()
export class CatalogService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly categories: CategoriesService,
  ) {}

  async list(query: CatalogQueryDto): Promise<Page<ProductDto>> {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice must not be greater than maxPrice');
    }
    const [items, total] = await this.products.findCatalogPage(
      {
        statuses: LISTED_STATUSES,
        categoryIds: query.categoryId
          ? await this.categories.withDescendants(query.categoryId)
          : undefined,
        sellerId: query.sellerId,
        type: query.type,
        q: query.q,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        minRating: query.minRating,
        inStock: query.inStock,
      },
      query.sort,
      toSkipTake(query),
    );
    return toPage(items.map(toProductDto), total, query);
  }

  async get(productId: string): Promise<ProductDto> {
    const product = await this.products.findVisible(productId, VIEWABLE_STATUSES);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return toProductDto(product);
  }

  async similar(productId: string, query: SimilarProductsQueryDto): Promise<ProductDto[]> {
    const product = await this.products.findVisible(productId, VIEWABLE_STATUSES);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const similar = await this.products.findSimilar(product, LISTED_STATUSES, query.limit);
    return similar.map(toProductDto);
  }
}
