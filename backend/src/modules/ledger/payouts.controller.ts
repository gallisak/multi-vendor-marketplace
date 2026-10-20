import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { Role } from '../../generated/prisma/enums.js';
import { SellersService } from '../sellers/sellers.service.js';
import { PayoutsQueryDto, SellerPayoutsDto } from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';

@ApiTags('seller')
@Roles(Role.SELLER)
@Controller('seller/payouts')
export class SellerPayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly sellers: SellersService,
  ) {}

  @Get()
  @ApiOkResponse({ type: SellerPayoutsDto })
  async list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    const sellerId = await this.sellers.requireActiveSellerId(user.id);
    return this.payouts.forSeller(sellerId, query);
  }
}

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list(@Query() query: PayoutsQueryDto) {
    return this.payouts.list(query);
  }
}
