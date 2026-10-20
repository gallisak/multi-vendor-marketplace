import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { trim } from '../../common/transforms.js';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Arrived quickly, works great' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 2000)
  comment?: string;
}

export class ReviewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating: number;
  @ApiPropertyOptional({ nullable: true, type: String }) comment: string | null;
  @ApiProperty({ example: 'O***' }) author: string;
  @ApiProperty() createdAt: Date;
}

export class ProductRatingDto {
  @ApiProperty({ example: 4.5 }) ratingAvg: number;
  @ApiProperty() ratingCount: number;
}
