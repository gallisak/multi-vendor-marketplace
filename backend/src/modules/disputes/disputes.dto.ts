import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';
import { DisputeStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';
import { trim } from '../../common/transforms.js';

export const DISPUTE_DECISIONS = ['BUYER', 'SELLER'] as const;
export type DisputeDecision = (typeof DISPUTE_DECISIONS)[number];

export class OpenDisputeDto {
  @ApiProperty({ example: 'The item arrived broken and the seller does not respond' })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  reason: string;
}

export class ResolveDisputeDto {
  @ApiProperty({
    enum: DISPUTE_DECISIONS,
    description: 'BUYER refunds everything not refunded yet',
  })
  @IsIn(DISPUTE_DECISIONS)
  decision: DisputeDecision;

  @ApiProperty({ example: 'Photos confirm the damage' })
  @Transform(trim)
  @IsString()
  @Length(3, 2000)
  note: string;
}

export class DisputesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DisputeStatus })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;
}

export class DisputeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) sellerOrderId: string;
  @ApiProperty({ format: 'uuid' }) orderId: string;
  @ApiProperty({ example: 'Tech Store' }) storeName: string;
  @ApiProperty({ enum: SellerOrderStatus }) sellerOrderStatus: SellerOrderStatus;
  @ApiProperty() subtotalMinor: number;
  @ApiProperty() refundedMinor: number;
  @ApiProperty({ enum: DisputeStatus }) status: DisputeStatus;
  @ApiProperty() reason: string;
  @ApiPropertyOptional({ nullable: true, type: String }) resolutionNote: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) resolvedAt: Date | null;
}
