import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CatalogQueryDto } from '../products/products.dto.js';

export class SearchQueryDto extends CatalogQueryDto {}

export class SearchHitDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() type: string;
  @ApiProperty({ description: 'Current bid for auctions' }) priceMinor: number;
  @ApiProperty() stock: number;
  @ApiProperty() inStock: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) imageUrl: string | null;
  @ApiProperty() ratingAvg: number;
  @ApiProperty() ratingCount: number;
  @ApiProperty() categoryId: string;
  @ApiProperty() categoryName: string;
  @ApiProperty() sellerId: string;
  @ApiProperty() sellerName: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) auctionEndsAt: number | null;
}

export class SearchResultDto {
  @ApiProperty({ type: [SearchHitDto] }) items: SearchHitDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;

  @ApiProperty({
    example: { categoryIds: { 'uuid-1': 3 }, sellerId: {}, type: {}, inStock: {} },
    description: 'Value counts per facet; empty when served by the database fallback',
  })
  facets: Record<'categoryIds' | 'sellerId' | 'type' | 'inStock', Record<string, number>>;

  @ApiPropertyOptional({ nullable: true, example: { min: 1000, max: 500000 } })
  priceRange: { min: number; max: number } | null;

  @ApiProperty({ enum: ['search', 'database'] }) source: 'search' | 'database';
  @ApiProperty({ description: 'True when the search engine is unavailable' }) degraded: boolean;
}
