import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { IdempotencyKey } from '../../common/idempotency-key.decorator.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { Role } from '../../generated/prisma/enums.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutDto, OrderDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';
import { sendIdempotent } from '../../infra/idempotency/idempotency.service.js';

@ApiTags('orders')
@Roles(Role.CUSTOMER, Role.SELLER)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  @Post('checkout')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per checkout attempt; retrying with the same key returns the same order',
  })
  @ApiCreatedResponse({ type: OrderDto })
  @ApiBadRequestResponse({ description: 'Empty cart or missing Idempotency-Key' })
  @ApiConflictResponse({ description: 'Items unavailable, not enough stock or prices changed' })
  @ApiUnprocessableEntityResponse({ description: 'Idempotency-Key reused with another body' })
  async checkout(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() key: string,
    @Body() dto: CheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderDto> {
    return sendIdempotent(await this.checkoutService.checkout(user.id, key, dto), res);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.orders.listForBuyer(user.id, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: OrderDto })
  @ApiNotFoundResponse({ description: 'Not found or belongs to another buyer' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getForBuyer(user.id, id);
  }
}
