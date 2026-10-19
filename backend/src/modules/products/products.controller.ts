import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { CatalogService } from './catalog.service.js';
import { ProductModerationService } from './product-moderation.service.js';
import {
  CatalogQueryDto,
  CreateProductDto,
  ProductDto,
  RejectProductDto,
  SellerProductDto,
  SellerProductsQueryDto,
  SimilarProductsQueryDto,
  StockAdjustmentDto,
  UpdateProductDto,
} from './products.dto.js';
import { SellerProductsService } from './seller-products.service.js';

@ApiTags('catalog')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query() query: CatalogQueryDto) {
    return this.catalog.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.get(id);
  }

  @Get(':id/similar')
  @ApiOkResponse({ type: [ProductDto], description: 'Listed products from the same category' })
  @ApiNotFoundResponse()
  similar(@Param('id', ParseUUIDPipe) id: string, @Query() query: SimilarProductsQueryDto) {
    return this.catalog.similar(id, query);
  }
}

@ApiTags('seller')
@Roles(Role.SELLER)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: SellerProductsService) {}

  @Post()
  @ApiCreatedResponse({ type: SellerProductDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: SellerProductsQueryDto) {
    return this.products.list(user.id, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: SellerProductDto })
  @ApiNotFoundResponse({ description: 'Not found or owned by another seller' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(user.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SellerProductDto })
  @ApiConflictResponse({ description: 'Archived or modified concurrently' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.id, id, dto);
  }

  @Post(':id/stock-adjustments')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerProductDto })
  @ApiConflictResponse({ description: 'Not enough stock to write off' })
  adjustStock(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockAdjustmentDto,
  ) {
    return this.products.adjustStock(user.id, id, dto.delta);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiConflictResponse({ description: 'Auction with bids cannot be archived' })
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.archive(user.id, id);
  }
}

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly moderation: ProductModerationService) {}

  @Get()
  list(@Query() query: SellerProductsQueryDto) {
    return this.moderation.list(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerProductDto })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.moderation.approve(id, admin.id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: SellerProductDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: RejectProductDto,
  ) {
    return this.moderation.reject(id, admin.id, dto.note);
  }
}
