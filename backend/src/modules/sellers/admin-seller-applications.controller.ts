import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { SellerApplicationsService } from './seller-applications.service.js';
import {
  ApproveApplicationDto,
  RejectApplicationDto,
  SellerApplicationDto,
  SellerApplicationsQueryDto,
} from './sellers.dto.js';

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/seller-applications')
export class AdminSellerApplicationsController {
  constructor(private readonly applications: SellerApplicationsService) {}

  @Get()
  list(@Query() query: SellerApplicationsQueryDto) {
    return this.applications.list(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerApplicationDto })
  @ApiConflictResponse({ description: 'Already reviewed or store name taken' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: ApproveApplicationDto,
  ) {
    return this.applications.approve(id, admin.id, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerApplicationDto })
  @ApiConflictResponse({ description: 'Already reviewed' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.applications.reject(id, admin.id, dto.note);
  }
}
