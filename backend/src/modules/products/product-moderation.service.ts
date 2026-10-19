import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toPage, toSkipTake } from '../../common/pagination.js';
import { ProductStatus } from '../../generated/prisma/enums.js';
import { toSellerProductDto } from './product.mapper.js';
import type { SellerProductsQueryDto } from './products.dto.js';
import { ProductsRepository } from './products.repository.js';

@Injectable()
export class ProductModerationService {
  private readonly logger = new Logger(ProductModerationService.name);

  constructor(private readonly products: ProductsRepository) {}

  async list(query: SellerProductsQueryDto) {
    const [items, total] = await this.products.findPageByStatus(
      query.status ?? ProductStatus.PENDING_MODERATION,
      toSkipTake(query),
    );
    return toPage(items.map(toSellerProductDto), total, query);
  }

  async approve(productId: string, adminId: string) {
    const product = await this.findPending(productId);
    if (product.auction && product.auction.endsAt <= new Date()) {
      throw new ConflictException('Auction end date has already passed');
    }
    await this.transition(productId, ProductStatus.ACTIVE, null);
    this.logger.log({ productId, adminId }, 'Product approved');
    return this.get(productId);
  }

  async reject(productId: string, adminId: string, note: string) {
    await this.findPending(productId);
    await this.transition(productId, ProductStatus.REJECTED, note);
    this.logger.log({ productId, adminId }, 'Product rejected');
    return this.get(productId);
  }

  private async findPending(productId: string) {
    const product = await this.products.findForModeration(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.status !== ProductStatus.PENDING_MODERATION) {
      throw new ConflictException('Product is not awaiting moderation');
    }
    return product;
  }

  private async transition(productId: string, status: ProductStatus, note: string | null) {
    if (!(await this.products.moderate(productId, status, note))) {
      throw new ConflictException('Product is not awaiting moderation');
    }
  }

  private async get(productId: string) {
    return toSellerProductDto(await this.products.get(productId));
  }
}
