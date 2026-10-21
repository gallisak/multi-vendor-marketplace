import { AuctionStatus, ProductStatus } from '../../generated/prisma/enums.js';

export const AUCTION_MIN_DURATION_MS = 5 * 60 * 1000;
export const AUCTION_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ProductContent {
  title: string;
  description: string;
  categoryId: string;
  imageUrls: string[];
}

export function hasContentChanges(current: ProductContent, patch: Partial<ProductContent>) {
  return (
    (patch.title !== undefined && patch.title !== current.title) ||
    (patch.description !== undefined && patch.description !== current.description) ||
    (patch.categoryId !== undefined && patch.categoryId !== current.categoryId) ||
    (patch.imageUrls !== undefined &&
      (patch.imageUrls.length !== current.imageUrls.length ||
        patch.imageUrls.some((url, index) => url !== current.imageUrls[index])))
  );
}

export function statusAfterEdit(status: ProductStatus, contentChanged: boolean): ProductStatus {
  if (status === ProductStatus.REJECTED) {
    return ProductStatus.PENDING_MODERATION;
  }
  if (status === ProductStatus.ACTIVE && contentChanged) {
    return ProductStatus.PENDING_MODERATION;
  }
  return status;
}

export function auctionWindowError(endsAt: Date, now: Date = new Date()): string | null {
  const duration = endsAt.getTime() - now.getTime();
  if (duration < AUCTION_MIN_DURATION_MS) {
    return 'Auction must last at least 5 minutes';
  }
  if (duration > AUCTION_MAX_DURATION_MS) {
    return 'Auction cannot last longer than 30 days';
  }
  return null;
}

type BiddableAuction = { status: AuctionStatus; bidCount: number } | null;

function hasLiveBids(auction: BiddableAuction): boolean {
  if (!auction) {
    return false;
  }
  const running =
    auction.status === AuctionStatus.ACTIVE || auction.status === AuctionStatus.AWAITING_CHECKOUT;
  return running && auction.bidCount > 0;
}

export function archiveBlockReason(auction: BiddableAuction): string | null {
  return hasLiveBids(auction) ? 'Auction with bids cannot be archived' : null;
}

export function editBlockReason(auction: BiddableAuction, contentChanged: boolean): string | null {
  return contentChanged && hasLiveBids(auction)
    ? 'Auction with bids cannot be edited, bidders rely on the current description'
    : null;
}
