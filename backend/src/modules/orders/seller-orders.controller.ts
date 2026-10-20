import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { SellerOrderDto, SellerOrdersQueryDto } from './orders.dto.js';
import { SellerOrdersService } from './seller-orders.service.js';

@ApiTags('seller')
@Roles(Role.SELLER)
@Controller('seller/orders')
export class SellerOrdersController {
  constructor(private readonly sellerOrders: SellerOrdersService) {}

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

  @Post(':id/ship')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerOrderDto, description: 'PROCESSING -> SHIPPED' })
  @ApiConflictResponse({ description: 'Not in PROCESSING status' })
  ship(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sellerOrders.ship(user.id, id);
  }
}
