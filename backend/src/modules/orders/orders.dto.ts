import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { OrderStatus, PaymentStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';

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
