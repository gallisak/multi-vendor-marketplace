import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutStatus } from '../../generated/prisma/enums.js';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export class PayoutsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sellerId?: string;
}

export class PayoutDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) sellerId: string;
  @ApiProperty() storeName: string;
  @ApiProperty({ description: 'Transferred to the seller, in minor units' }) amountMinor: number;
  @ApiProperty({ description: 'Ledger lines settled by this payout' }) entriesSettled: number;
  @ApiProperty({ enum: PayoutStatus, description: 'PENDING until the transfer is confirmed' })
  status: PayoutStatus;
  @ApiProperty({ type: String, nullable: true, example: 'mock_transfer_0190' })
  providerRef: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: Date, nullable: true }) paidAt: Date | null;
}

export class SellerPayoutsDto {
  @ApiProperty({ description: 'Earned but not paid out yet' }) pendingMinor: number;
  @ApiProperty() paidOutMinor: number;
  @ApiProperty({ type: [PayoutDto] }) items: PayoutDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
