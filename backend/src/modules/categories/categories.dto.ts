import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { SLUG_PATTERN } from '../../common/slug.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCategoryDto {
  @ApiProperty({ example: 'Tablets' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional({ example: 'tablets', description: 'Generated from name when omitted' })
  @IsOptional()
  @Matches(SLUG_PATTERN, { message: 'slug must be lowercase latin words separated by dashes' })
  @Length(2, 80)
  slug?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(SLUG_PATTERN, { message: 'slug must be lowercase latin words separated by dashes' })
  @Length(2, 80)
  slug?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;
}

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;
}

export class CategoryTreeDto extends CategoryDto {
  @ApiProperty({ type: () => [CategoryTreeDto] })
  children: CategoryTreeDto[];
}
