import { AuctionStatus, ProductStatus } from '../../generated/prisma/enums.js';
import {
  archiveBlockReason,
  auctionWindowError,
  editBlockReason,
  hasContentChanges,
  ProductContent,
  statusAfterEdit,
} from './product.rules.js';

const content: ProductContent = {
  title: 'Phone',
  description: 'Nice phone',
  categoryId: 'cat-1',
  imageUrls: ['https://img/1.png'],
};

describe('hasContentChanges', () => {
  it('ignores fields that are absent or unchanged', () => {
    expect(hasContentChanges(content, {})).toBe(false);
    expect(hasContentChanges(content, { title: 'Phone', imageUrls: ['https://img/1.png'] })).toBe(
      false,
    );
  });

  it.each<Partial<ProductContent>>([
    { title: 'Phone Pro' },
    { description: 'Better phone' },
    { categoryId: 'cat-2' },
    { imageUrls: [] },
    { imageUrls: ['https://img/2.png'] },
  ])('detects a change in %o', (patch) => {
    expect(hasContentChanges(content, patch)).toBe(true);
  });
});

describe('statusAfterEdit', () => {
  it('sends an active product back to moderation when content changes', () => {
    expect(statusAfterEdit(ProductStatus.ACTIVE, true)).toBe(ProductStatus.PENDING_MODERATION);
  });

  it('keeps an active product live for price-only edits', () => {
    expect(statusAfterEdit(ProductStatus.ACTIVE, false)).toBe(ProductStatus.ACTIVE);
  });

  it('resubmits a rejected product on any edit', () => {
    expect(statusAfterEdit(ProductStatus.REJECTED, false)).toBe(ProductStatus.PENDING_MODERATION);
  });

  it('keeps a pending product pending', () => {
    expect(statusAfterEdit(ProductStatus.PENDING_MODERATION, true)).toBe(
      ProductStatus.PENDING_MODERATION,
    );
  });
});

describe('auctionWindowError', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it('accepts durations between 5 minutes and 30 days', () => {
    expect(auctionWindowError(inMinutes(5), now)).toBeNull();
    expect(auctionWindowError(inMinutes(30 * 24 * 60), now)).toBeNull();
  });

  it('rejects too short and past auctions', () => {
    expect(auctionWindowError(inMinutes(4), now)).toMatch(/at least 5 minutes/);
    expect(auctionWindowError(inMinutes(-10), now)).toMatch(/at least 5 minutes/);
  });

  it('rejects auctions longer than 30 days', () => {
    expect(auctionWindowError(inMinutes(30 * 24 * 60 + 1), now)).toMatch(/30 days/);
  });
});

describe('archiveBlockReason', () => {
  it('allows archiving fixed price products and auctions without bids', () => {
    expect(archiveBlockReason(null)).toBeNull();
    expect(archiveBlockReason({ status: AuctionStatus.ACTIVE, bidCount: 0 })).toBeNull();
  });

  it('blocks archiving running auctions with bids', () => {
    expect(archiveBlockReason({ status: AuctionStatus.ACTIVE, bidCount: 3 })).toMatch(/bids/);
    expect(archiveBlockReason({ status: AuctionStatus.AWAITING_CHECKOUT, bidCount: 1 })).toMatch(
      /bids/,
    );
  });

  it('allows archiving finished auctions', () => {
    expect(archiveBlockReason({ status: AuctionStatus.UNSOLD, bidCount: 0 })).toBeNull();
    expect(archiveBlockReason({ status: AuctionStatus.SOLD, bidCount: 5 })).toBeNull();
  });
});

describe('editBlockReason', () => {
  it('blocks content edits of running auctions that already have bids', () => {
    expect(editBlockReason({ status: AuctionStatus.ACTIVE, bidCount: 2 }, true)).toMatch(/bids/);
    expect(editBlockReason({ status: AuctionStatus.AWAITING_CHECKOUT, bidCount: 1 }, true)).toMatch(
      /bids/,
    );
  });

  it('allows edits without content changes, without bids or after the auction is over', () => {
    expect(editBlockReason({ status: AuctionStatus.ACTIVE, bidCount: 2 }, false)).toBeNull();
    expect(editBlockReason({ status: AuctionStatus.ACTIVE, bidCount: 0 }, true)).toBeNull();
    expect(editBlockReason({ status: AuctionStatus.UNSOLD, bidCount: 0 }, true)).toBeNull();
    expect(editBlockReason(null, true)).toBeNull();
  });
});
