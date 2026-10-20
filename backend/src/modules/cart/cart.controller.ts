import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { CartDto, SetCartItemDto } from './cart.dto.js';
import { CartService } from './cart.service.js';

@ApiTags('cart')
@Roles(Role.CUSTOMER, Role.SELLER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOkResponse({ type: CartDto })
  view(@CurrentUser() user: AuthUser) {
    return this.cart.view(user.id);
  }

  @Put('items/:productId')
  @ApiOkResponse({ type: CartDto, description: 'Sets the quantity; repeating the call is safe' })
  @ApiNotFoundResponse({ description: 'Product is not on sale' })
  @ApiBadRequestResponse({ description: 'Auction lot or own product' })
  @ApiConflictResponse({ description: 'Not enough stock' })
  setItem(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetCartItemDto,
  ) {
    return this.cart.setItem(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @ApiOkResponse({ type: CartDto })
  removeItem(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.cart.removeItem(user.id, productId);
  }

  @Delete()
  @HttpCode(204)
  clear(@CurrentUser() user: AuthUser) {
    return this.cart.clear(user.id);
  }
}
