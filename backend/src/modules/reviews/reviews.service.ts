import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { productChanged } from '../../common/events/domain-events.js';
import { PaginationQueryDto, toPage, toSkipTake } from '../../common/pagination.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { maskBidder } from '../auctions/auction.rules.js';
import { VIEWABLE_STATUSES } from '../products/catalog.service.js';
import type { CreateReviewDto, ProductRatingDto, ReviewDto } from './reviews.dto.js';
import { ReviewsRepository } from './reviews.repository.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    authorId: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDto & ProductRatingDto> {
    try {
      return await this.uow.run(async (tx) => {
        const product = await this.reviews.lockProduct(productId, tx);
        if (!product) {
          throw new NotFoundException('Product not found');
        }

        if (await this.reviews.exists(productId, authorId, tx)) {
          throw new ConflictException('You have already reviewed this product');
        }

        const purchase = await this.reviews.findReceivedPurchase(productId, authorId, tx);
        if (!purchase) {
          throw new ForbiddenException('Only buyers who received this product can review it');
        }

        const review = await this.reviews.create(
          {
            productId,
            authorId,
            orderItemId: purchase.id,
            rating: dto.rating,
            comment: dto.comment,
          },
          tx,
        );

        const rating = await this.reviews.refreshProductRating(productId, tx);
        await this.reviews.refreshSellerRating(product.sellerId, tx);
        await this.outbox.add(tx, productChanged(productId, 'reviewed'));

        this.logger.log({ productId, reviewId: review.id, rating: dto.rating }, 'Review added');
        return {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          author: maskBidder(review.author.name),
          createdAt: review.createdAt,
          ...rating,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }
  }

  async list(productId: string, query: PaginationQueryDto) {
    const product = await this.reviews.productRating(productId);
    if (!product || !VIEWABLE_STATUSES.includes(product.status)) {
      throw new NotFoundException('Product not found');
    }
    const [reviews, total] = await this.reviews.findPage(productId, toSkipTake(query));
    return {
      ...toPage<ReviewDto>(
        reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          author: maskBidder(review.author.name),
          createdAt: review.createdAt,
        })),
        total,
        query,
      ),
      ratingAvg: product.ratingAvg.toNumber(),
      ratingCount: product.ratingCount,
    };
  }
}
