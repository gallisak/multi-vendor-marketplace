import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { DisputeDto, DisputesQueryDto, OpenDisputeDto, ResolveDisputeDto } from './disputes.dto.js';
import { DisputesService } from './disputes.service.js';

@ApiTags('disputes')
@Roles(Role.CUSTOMER, Role.SELLER)
@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post('orders/:orderId/seller-orders/:sellerOrderId/disputes')
  @ApiCreatedResponse({ type: DisputeDto })
  @ApiNotFoundResponse({ description: 'Not found or belongs to another buyer' })
  @ApiConflictResponse({ description: 'Not shipped yet, already refunded or already disputed' })
  open(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('sellerOrderId', ParseUUIDPipe) sellerOrderId: string,
    @Body() dto: OpenDisputeDto,
  ) {
    return this.disputes.open(user.id, orderId, sellerOrderId, dto.reason);
  }

  @Get('disputes')
  listOwn(@CurrentUser() user: AuthUser, @Query() query: DisputesQueryDto) {
    return this.disputes.listForBuyer(user.id, query);
  }

  @Post('disputes/:id/withdraw')
  @HttpCode(200)
  @ApiOkResponse({ type: DisputeDto })
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.withdraw(user.id, id);
  }

  @Roles(Role.SELLER)
  @Get('seller/disputes')
  listForSeller(@CurrentUser() user: AuthUser, @Query() query: DisputesQueryDto) {
    return this.disputes.listForSeller(user.id, query);
  }
}

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(@Query() query: DisputesQueryDto) {
    return this.disputes.listAll(query);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @ApiOkResponse({ type: DisputeDto })
  @ApiConflictResponse({ description: 'Already resolved' })
  resolve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputes.resolve(admin.id, id, dto);
  }
}
