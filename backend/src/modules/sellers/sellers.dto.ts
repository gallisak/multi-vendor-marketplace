import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';
import { SellerApplicationStatus } from '../../generated/prisma/enums.js';
import { trim } from '../../common/transforms.js';

export class CreateSellerApplicationDto {
  @ApiProperty({ example: 'Home Goods' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  storeName: string;

  @ApiPropertyOptional({ example: 'Kitchen and home accessories' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class ApproveApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectApplicationDto {
  @ApiProperty({ example: 'Store name violates the naming policy' })
  @Transform(trim)
  @IsString()
  @Length(3, 1000)
  note: string;
}

export class SellerApplicationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SellerApplicationStatus })
  @IsOptional()
  @IsEnum(SellerApplicationStatus)
  status?: SellerApplicationStatus;
}

export class SellerApplicationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  storeName: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: SellerApplicationStatus })
  status: SellerApplicationStatus;

  @ApiPropertyOptional({ nullable: true, type: String })
  reviewNote: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  reviewedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class SellerProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  storeName: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: 4.5 })
  ratingAvg: number;

  @ApiProperty()
  ratingCount: number;

  @ApiProperty()
  createdAt: Date;
}
