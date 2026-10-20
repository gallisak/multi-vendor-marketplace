import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class PeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-09-21', description: 'Inclusive, defaults to 30 days ago' })
  @IsOptional()
  @Matches(ISO_DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-20', description: 'Inclusive, defaults to today' })
  @IsOptional()
  @Matches(ISO_DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class ExportQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'json'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'json'])
  format: 'csv' | 'json' = 'csv';
}

export class ChartQueryDto {
  @ApiPropertyOptional({ minimum: 7, maximum: 90, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days: number = 30;
}

export class MoneyTotalsDto {
  @ApiProperty() grossMinor: number;
  @ApiProperty() refundedMinor: number;
  @ApiProperty({ description: 'Net platform commission' }) commissionMinor: number;
  @ApiProperty({ description: 'Net amount owed to sellers' }) payoutMinor: number;
}
