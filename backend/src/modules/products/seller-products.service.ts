import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toPage, toSkipTake } from '../../common/pagination.js';
import { AuctionStatus, ProductStatus, ProductType } from '../../generated/prisma/enums.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { CategoriesService } from '../categories/categories.service.js';
import { SellersService } from '../sellers/sellers.service.js';
import { toSellerProductDto } from './product.mapper.js';
import {
  archiveBlockReason,
  auctionWindowError,
  hasContentChanges,
  statusAfterEdit,
} from './product.rules.js';
import type {
  CreateProductDto,
  SellerProductDto,
  SellerProductsQueryDto,
  UpdateProductDto,
} from './products.dto.js';
import { ProductsRepository } from './products.repository.js';

@Injectable()
export class SellerProductsService {
  private readonly logger = new Logger(SellerProductsService.name);

  constructor(
    private readonly products: ProductsRepository,
    private readonly uow: UnitOfWork,
    private readonly sellers: SellersService,
    private readonly categories: CategoriesService,
  ) {}

  async create(userId: string, dto: CreateProductDto): Promise<SellerProductDto> {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    this.assertTypeSpecificFields(dto);
    await this.categories.assertExists(dto.categoryId);

    const isAuction = dto.type === ProductType.AUCTION;
    const product = await this.products.create({
      sellerId,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      status: ProductStatus.PENDING_MODERATION,
      priceMinor: isAuction ? dto.auction!.startPriceMinor : dto.priceMinor!,
      stock: isAuction ? 1 : dto.stock!,
      imageUrls: dto.imageUrls ?? [],
      auction: isAuction
        ? {
            startPriceMinor: dto.auction!.startPriceMinor,
            bidStepMinor: dto.auction!.bidStepMinor,
            endsAt: dto.auction!.endsAt,
          }
        : undefined,
    });

    this.logger.log({ productId: product.id, sellerId, type: dto.type }, 'Product created');
    return toSellerProductDto(product);
  }

  async list(userId: string, query: SellerProductsQueryDto) {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    const [items, total] = await this.products.findPageBySeller(
      sellerId,
      query.status,
      toSkipTake(query),
    );
    return toPage(items.map(toSellerProductDto), total, query);
  }

  async get(userId: string, productId: string): Promise<SellerProductDto> {
    return toSellerProductDto(await this.findOwned(userId, productId));
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.findOwned(userId, productId);
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException('Archived product cannot be edited');
    }
    if (dto.priceMinor !== undefined && product.type === ProductType.AUCTION) {
      throw new BadRequestException('Auction price is driven by bids');
    }
    if (dto.categoryId) {
      await this.categories.assertExists(dto.categoryId);
    }

    const status = statusAfterEdit(product.status, hasContentChanges(product, dto));
    const updated = await this.products.updateVersioned(product, {
      title: dto.title,
      description: dto.description,
      categoryId: dto.categoryId,
      imageUrls: dto.imageUrls,
      priceMinor: dto.priceMinor,
      status,
      moderationNote: status === ProductStatus.PENDING_MODERATION ? null : undefined,
    });
    if (!updated) {
      throw new ConflictException('Product was modified concurrently, reload and retry');
    }

    this.logger.log({ productId, statusFrom: product.status, statusTo: status }, 'Product updated');
    return this.get(userId, productId);
  }

  async adjustStock(userId: string, productId: string, delta: number) {
    const product = await this.findOwned(userId, productId);
    if (product.type === ProductType.AUCTION) {
      throw new BadRequestException('Auction lot stock cannot be adjusted');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException('Archived product cannot be restocked');
    }

    if (!(await this.products.adjustStock(product, delta))) {
      throw new ConflictException('Not enough stock to write off');
    }

    this.logger.log({ productId, delta }, 'Product stock adjusted');
    return this.get(userId, productId);
  }

  async archive(userId: string, productId: string) {
    const product = await this.findOwned(userId, productId);
    if (product.status === ProductStatus.ARCHIVED) {
      return;
    }
    const blockReason = archiveBlockReason(product.auction);
    if (blockReason) {
      throw new ConflictException(blockReason);
    }

    await this.uow.run(async (tx) => {
      if (!(await this.products.updateVersioned(product, { status: ProductStatus.ARCHIVED }, tx))) {
        throw new ConflictException('Product was modified concurrently, reload and retry');
      }
      if (product.auction?.status === AuctionStatus.ACTIVE) {
        if (!(await this.products.cancelIdleAuction(product.auction.id, tx))) {
          throw new ConflictException('Auction with bids cannot be archived');
        }
      }
    });
    this.logger.log({ productId }, 'Product archived');
  }

  private async findOwned(userId: string, productId: string) {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    const product = await this.products.findOwned(productId, sellerId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private assertTypeSpecificFields(dto: CreateProductDto) {
    if (dto.type === ProductType.AUCTION) {
      if (dto.priceMinor !== undefined || dto.stock !== undefined) {
        throw new BadRequestException('Auction lots take price from auction.startPriceMinor');
      }
      const windowError = auctionWindowError(dto.auction!.endsAt);
      if (windowError) {
        throw new BadRequestException(windowError);
      }
    } else if (dto.auction !== undefined) {
      throw new BadRequestException('auction is only allowed for AUCTION products');
    }
  }
}
