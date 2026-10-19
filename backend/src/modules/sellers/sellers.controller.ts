import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { SellerApplicationsService } from './seller-applications.service.js';
import {
  CreateSellerApplicationDto,
  SellerApplicationDto,
  SellerProfileDto,
} from './sellers.dto.js';
import { SellersService } from './sellers.service.js';

@ApiTags('sellers')
@Controller()
export class SellersController {
  constructor(
    private readonly applications: SellerApplicationsService,
    private readonly sellers: SellersService,
  ) {}

  @Roles(Role.CUSTOMER)
  @Post('seller-applications')
  @ApiCreatedResponse({ type: SellerApplicationDto })
  @ApiConflictResponse({ description: 'Pending application exists or store name is taken' })
  apply(@CurrentUser() user: AuthUser, @Body() dto: CreateSellerApplicationDto) {
    return this.applications.apply(user.id, dto);
  }

  @Get('seller-applications/me')
  @ApiOkResponse({ type: [SellerApplicationDto] })
  listOwn(@CurrentUser() user: AuthUser) {
    return this.applications.listOwn(user.id);
  }

  @Public()
  @Get('sellers/:id')
  @ApiOkResponse({ type: SellerProfileDto })
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.sellers.getPublicProfile(id);
  }
}
