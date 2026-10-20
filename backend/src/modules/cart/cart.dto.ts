import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_LINE_QUANTITY, UNAVAILABLE_REASONS, type UnavailableReason } from './cart.rules.js';

export class SetCartItemDto {
  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY, example: 2 })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class CartLineDto {
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true, type: String }) imageUrl: string | null;
  @ApiProperty() unitPriceMinor: number;
  @ApiProperty() quantity: number;
  @ApiProperty() lineTotalMinor: number;
  @ApiProperty({ description: 'Units currently in stock' }) stock: number;
  @ApiProperty() available: boolean;
  @ApiPropertyOptional({ enum: UNAVAILABLE_REASONS, nullable: true })
  unavailableReason: UnavailableReason | null;
}

export class CartSellerGroupDto {
  @ApiProperty({ format: 'uuid' }) sellerId: string;
  @ApiProperty() storeName: string;
  @ApiProperty({ type: [CartLineDto] }) items: CartLineDto[];
  @ApiProperty({ description: 'Sum of available lines' }) subtotalMinor: number;
}

export class CartDto {
  @ApiProperty({ type: [CartSellerGroupDto] }) sellers: CartSellerGroupDto[];
  @ApiProperty({ description: 'Sum of available lines' }) totalMinor: number;
  @ApiProperty() itemsCount: number;
  @ApiProperty() hasUnavailableItems: boolean;
}
