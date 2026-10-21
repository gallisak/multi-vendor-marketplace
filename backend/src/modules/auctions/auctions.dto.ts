import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { AuctionStatus } from '../../generated/prisma/enums.js';

export class PlaceBidDto {
  @ApiProperty({ example: 210_000, description: 'Minor units; at least the minimum next bid' })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountMinor: number;
}

export class BidResultDto {
  @ApiProperty({ format: 'uuid' }) auctionId: string;
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() amountMinor: number;
  @ApiProperty() bidCount: number;
  @ApiProperty() minNextBidMinor: number;
  @ApiProperty() endsAt: Date;
}

export class PublicBidDto {
  @ApiProperty() amountMinor: number;
  @ApiProperty({ example: 'O***' }) bidder: string;
  @ApiProperty() createdAt: Date;
}

export class AuctionViewerDto {
  @ApiProperty({ description: 'The viewer is the seller of this lot' }) isSeller: boolean;
  @ApiProperty({ description: 'The viewer holds the highest bid' }) isLeader: boolean;
  @ApiProperty({ description: 'The viewer won and may check out' }) isWinner: boolean;
}

export class AuctionViewDto {
  @ApiProperty({ format: 'uuid' }) auctionId: string;
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: AuctionStatus }) status: AuctionStatus;
  @ApiProperty() startPriceMinor: number;
  @ApiProperty() bidStepMinor: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) currentPriceMinor: number | null;
  @ApiProperty() minNextBidMinor: number;
  @ApiProperty() bidCount: number;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'O***' }) leader: string | null;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) checkoutDeadline: Date | null;
  @ApiProperty({ type: [PublicBidDto] }) recentBids: PublicBidDto[];
  @ApiProperty({ description: 'Database time, for client countdowns' }) serverTime: Date;
  @ApiPropertyOptional({
    type: AuctionViewerDto,
    nullable: true,
    description: 'Present when the request carries a valid access token',
  })
  viewer: AuctionViewerDto | null;
}
