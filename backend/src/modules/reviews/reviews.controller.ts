import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { Role } from '../../generated/prisma/enums.js';
import { CreateReviewDto, ReviewDto } from './reviews.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  list(@Param('productId', ParseUUIDPipe) productId: string, @Query() query: PaginationQueryDto) {
    return this.reviews.list(productId, query);
  }

  @Roles(Role.CUSTOMER, Role.SELLER)
  @Post()
  @ApiCreatedResponse({ type: ReviewDto })
  @ApiForbiddenResponse({ description: 'The product was not delivered to this user' })
  @ApiConflictResponse({ description: 'Already reviewed' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, productId, dto);
  }
}
