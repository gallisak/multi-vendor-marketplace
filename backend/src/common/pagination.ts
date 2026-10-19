import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Paging {
  skip: number;
  take: number;
}

export const toSkipTake = ({ page, limit }: PaginationQueryDto): Paging => ({
  skip: (page - 1) * limit,
  take: limit,
});

export const toPage = <T>(items: T[], total: number, query: PaginationQueryDto): Page<T> => ({
  items,
  total,
  page: query.page,
  limit: query.limit,
});
