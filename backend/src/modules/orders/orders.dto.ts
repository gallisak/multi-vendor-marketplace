import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { MAX_LINE_QUANTITY } from '../cart/cart.rules.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { OrderStatus, PaymentStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';
import { trim } from '../../common/transforms.js';

export class CheckoutDto {
  @ApiPropertyOptional({
    description: 'Total the buyer saw; checkout fails with 409 if prices changed meanwhile',
    example: 2_059_800,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedTotalMinor?: number;
}

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() title: string;
  @ApiProperty() unitPriceMinor: number;
  @ApiProperty() quantity: number;
  @ApiProperty() refundedQuantity: number;
  @ApiProperty() lineTotalMinor: number;
}

export class BuyerSellerOrderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) sellerId: string;
  @ApiProperty() storeName: string;
  @ApiProperty({ enum: SellerOrderStatus }) status: SellerOrderStatus;
  @ApiProperty() subtotalMinor: number;
  @ApiProperty() refundedMinor: number;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason: string | null;
  @ApiProperty({ type: [OrderItemDto] }) items: OrderItemDto[];
}

export class OrderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty({ enum: PaymentStatus }) paymentStatus: PaymentStatus;
  @ApiProperty() totalMinor: number;
  @ApiProperty() refundedMinor: number;
  @ApiProperty({ type: [BuyerSellerOrderDto] }) sellerOrders: BuyerSellerOrderDto[];
  @ApiProperty() createdAt: Date;
}

export class SellerOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SellerOrderStatus })
  @IsOptional()
  @IsEnum(SellerOrderStatus)
  status?: SellerOrderStatus;
}

export class SellerOrderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) orderId: string;
  @ApiProperty({ enum: SellerOrderStatus }) status: SellerOrderStatus;
  @ApiProperty({ enum: PaymentStatus }) paymentStatus: PaymentStatus;
  @ApiProperty() subtotalMinor: number;
  @ApiProperty({ example: 1000 }) commissionRateBps: number;
  @ApiProperty() commissionMinor: number;
  @ApiProperty() refundedMinor: number;
  @ApiProperty({ description: 'What the seller receives after commission and refunds' })
  payoutMinor: number;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason: string | null;
  @ApiProperty({ type: [OrderItemDto] }) items: OrderItemDto[];
  @ApiProperty({ type: () => [RefundDto] }) refunds: RefundDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CancelSellerOrderDto {
  @ApiProperty({ example: 'Item turned out to be out of stock' })
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class BuyerCancelDto {
  @ApiPropertyOptional({ example: 'Changed my mind' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class CreateRefundDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderItemId: string;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity: number;

  @ApiPropertyOptional({ example: 'Damaged in transit' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Return units to stock; always true before the seller order is shipped',
  })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

export class RefundDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) orderItemId: string;
  @ApiProperty() quantity: number;
  @ApiProperty() amountMinor: number;
  @ApiProperty() commissionReversalMinor: number;
  @ApiPropertyOptional({ nullable: true, type: String }) reason: string | null;
  @ApiProperty() createdAt: Date;
}
