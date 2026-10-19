import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDate,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';
import { AuctionStatus, ProductStatus, ProductType } from '../../generated/prisma/enums.js';

const MAX_PRICE_MINOR = 1_000_000_000;
const MAX_STOCK = 1_000_000;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAuctionDto {
  @ApiProperty({ example: 200_000, description: 'Minor units (kopecks)' })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  startPriceMinor: number;

  @ApiProperty({ example: 10_000 })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  bidStepMinor: number;

  @ApiProperty({ example: '2026-10-25T18:00:00Z' })
  @Type(() => Date)
  @IsDate()
  endsAt: Date;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Smartphone X12 128GB' })
  @Transform(trim)
  @IsString()
  @Length(3, 200)
  title: string;

  @ApiProperty({ example: '6.1" OLED display' })
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  description: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiPropertyOptional({ example: 1_899_900, description: 'Required for FIXED_PRICE' })
  @ValidateIf((dto: CreateProductDto) => dto.type === ProductType.FIXED_PRICE)
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  priceMinor?: number;

  @ApiPropertyOptional({ example: 10, description: 'Required for FIXED_PRICE' })
  @ValidateIf((dto: CreateProductDto) => dto.type === ProductType.FIXED_PRICE)
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock?: number;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: CreateAuctionDto, description: 'Required for AUCTION' })
  @ValidateIf((dto: CreateProductDto) => dto.type === ProductType.AUCTION)
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateAuctionDto)
  auction?: CreateAuctionDto;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Only for FIXED_PRICE products' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  priceMinor?: number;
}

export class StockAdjustmentDto {
  @ApiProperty({ example: 5, description: 'Positive to restock, negative to write off' })
  @IsInt()
  @NotEquals(0)
  @Min(-MAX_STOCK)
  @Max(MAX_STOCK)
  delta: number;
}

export class RejectProductDto {
  @ApiProperty({ example: 'Photos do not match the description' })
  @Transform(trim)
  @IsString()
  @Length(3, 1000)
  note: string;
}

export class SellerProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export const CATALOG_SORTS = ['newest', 'price_asc', 'price_desc', 'rating'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export class CatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in title' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Includes subcategories' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ enum: CATALOG_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(CATALOG_SORTS)
  sort: CatalogSort = 'newest';
}

export class ProductCategoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class ProductSellerDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() storeName: string;
}

export class ProductAuctionDto {
  @ApiProperty() startPriceMinor: number;
  @ApiProperty() bidStepMinor: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) currentPriceMinor: number | null;
  @ApiProperty() bidCount: number;
  @ApiProperty() endsAt: Date;
  @ApiProperty({ enum: AuctionStatus }) status: AuctionStatus;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: ProductType }) type: ProductType;
  @ApiProperty({ enum: ProductStatus }) status: ProductStatus;
  @ApiProperty({ description: 'Minor units; start price for auctions' }) priceMinor: number;
  @ApiProperty() stock: number;
  @ApiProperty({ type: [String] }) imageUrls: string[];
  @ApiProperty() ratingAvg: number;
  @ApiProperty() ratingCount: number;
  @ApiProperty({ type: ProductCategoryDto }) category: ProductCategoryDto;
  @ApiProperty({ type: ProductSellerDto }) seller: ProductSellerDto;
  @ApiPropertyOptional({ type: ProductAuctionDto, nullable: true })
  auction: ProductAuctionDto | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class SellerProductDto extends ProductDto {
  @ApiPropertyOptional({ nullable: true, type: String }) moderationNote: string | null;
  @ApiProperty() version: number;
}

export class SimilarProductsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 6;
}
