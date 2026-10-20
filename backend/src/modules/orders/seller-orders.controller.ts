import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import {
  CancelSellerOrderDto,
  CreateRefundDto,
  SellerOrderDto,
  SellerOrdersQueryDto,
} from './orders.dto.js';
import { RefundsService } from './refunds.service.js';
import type { Response } from 'express';
import { IdempotencyKey } from '../../common/idempotency-key.decorator.js';
import { SellerOrdersService } from './seller-orders.service.js';
import { sendIdempotent } from '../../infra/idempotency/idempotency.service.js';

@ApiTags('seller')
@Roles(Role.SELLER)
@Controller('seller/orders')
export class SellerOrdersController {
  constructor(
    private readonly sellerOrders: SellerOrdersService,
    private readonly refunds: RefundsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: SellerOrdersQueryDto) {
    return this.sellerOrders.list(user.id, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiNotFoundResponse({ description: 'Not found or belongs to another seller' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sellerOrders.get(user.id, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerOrderDto, description: 'NEW -> PROCESSING' })
  @ApiConflictResponse({ description: 'Not paid yet or not in NEW status' })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sellerOrders.accept(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerOrderDto, description: 'Returns stock and refunds the buyer' })
  @ApiConflictResponse({ description: 'Already shipped or payment pending' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSellerOrderDto,
  ) {
    return this.sellerOrders.cancel(user.id, id, dto.reason);
  }

  @Post(':id/refunds')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: SellerOrderDto })
  @ApiConflictResponse({ description: 'Cancelled, unpaid or refunded concurrently' })
  @ApiUnprocessableEntityResponse({ description: 'Idempotency-Key reused with another body' })
  async refund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @IdempotencyKey() key: string,
    @Body() dto: CreateRefundDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SellerOrderDto> {
    return sendIdempotent(await this.refunds.issue(user.id, id, key, dto), res);
  }

  @Post(':id/ship')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerOrderDto, description: 'PROCESSING -> SHIPPED' })
  @ApiConflictResponse({ description: 'Not in PROCESSING status' })
  ship(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sellerOrders.ship(user.id, id);
  }
}
