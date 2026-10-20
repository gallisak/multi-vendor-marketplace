import { AuctionStatus } from '../../generated/prisma/enums.js';

export interface AuctionPricing {
  startPriceMinor: number;
  bidStepMinor: number;
  currentPriceMinor: number | null;
}

export interface BidContext extends AuctionPricing {
  status: AuctionStatus;
  endsAt: Date;
  leaderId: string | null;
  sellerUserId: string;
}

export type BidRejection =
  | { code: 'NOT_ACTIVE' }
  | { code: 'ENDED' }
  | { code: 'OWN_LOT' }
  | { code: 'ALREADY_LEADING' }
  | { code: 'TOO_LOW'; minimumMinor: number };

export function minNextBid(auction: AuctionPricing): number {
  return auction.currentPriceMinor === null
    ? auction.startPriceMinor
    : auction.currentPriceMinor + auction.bidStepMinor;
}

export function bidRejection(
  auction: BidContext,
  bidderId: string,
  amountMinor: number,
  now: Date,
): BidRejection | null {
  if (auction.status !== AuctionStatus.ACTIVE) return { code: 'NOT_ACTIVE' };
  if (auction.endsAt.getTime() <= now.getTime()) return { code: 'ENDED' };
  if (auction.sellerUserId === bidderId) return { code: 'OWN_LOT' };
  if (auction.leaderId === bidderId) return { code: 'ALREADY_LEADING' };
  const minimumMinor = minNextBid(auction);
  if (amountMinor < minimumMinor) return { code: 'TOO_LOW', minimumMinor };
  return null;
}

export function relistedWindow(startsAt: Date, endsAt: Date, now: Date) {
  const durationMs = endsAt.getTime() - startsAt.getTime();
  return { startsAt: now, endsAt: new Date(now.getTime() + durationMs) };
}

export function maskBidder(name: string): string {
  const trimmed = name.trim();
  return trimmed.length <= 1 ? '*' : `${trimmed[0]}***`;
}
