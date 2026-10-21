import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, OptionalUser, Public, Roles } from '../../common/auth/decorators.js';
import { IdempotencyKey } from '../../common/idempotency-key.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import { CheckoutService } from '../orders/checkout.service.js';
import { OrderDto } from '../orders/orders.dto.js';
import { AuctionViewDto, BidResultDto, PlaceBidDto } from './auctions.dto.js';
import { AuctionsService } from './auctions.service.js';
import { sendIdempotent } from '../../infra/idempotency/idempotency.service.js';

@ApiTags('auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(
    private readonly auctions: AuctionsService,
    private readonly checkout: CheckoutService,
  ) {}

  @Public()
  @Get(':productId')
  @ApiOkResponse({ type: AuctionViewDto })
  @ApiNotFoundResponse()
  view(
    @Param('productId', ParseUUIDPipe) productId: string,
    @OptionalUser() viewer: AuthUser | undefined,
  ) {
    return this.auctions.view(productId, viewer?.id);
  }

  @Roles(Role.CUSTOMER, Role.SELLER)
  @Post(':productId/bids')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: BidResultDto })
  @ApiBadRequestResponse({ description: 'Bid on own lot' })
  @ApiConflictResponse({ description: 'Too low, ended, not active or already leading' })
  @ApiTooManyRequestsResponse({ description: 'Too many bids from this IP' })
  async bid(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @IdempotencyKey() key: string,
    @Body() dto: PlaceBidDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BidResultDto> {
    return sendIdempotent(
      await this.auctions.placeBid(user.id, productId, key, dto.amountMinor),
      res,
    );
  }

  @Roles(Role.CUSTOMER, Role.SELLER)
  @Post(':productId/checkout')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: OrderDto, description: 'Order for the winner at the winning price' })
  @ApiNotFoundResponse({ description: 'No won auction for this user' })
  @ApiConflictResponse({ description: 'Window expired or not awaiting checkout' })
  async checkoutWon(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @IdempotencyKey() key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderDto> {
    return sendIdempotent(await this.checkout.checkoutAuction(user.id, key, productId), res);
  }
}
