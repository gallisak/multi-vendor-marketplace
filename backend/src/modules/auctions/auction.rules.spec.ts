import { AuctionStatus } from '../../generated/prisma/enums.js';
import {
  BidContext,
  bidRejection,
  maskBidder,
  minNextBid,
  relistedWindow,
} from './auction.rules.js';

const now = new Date('2026-10-20T12:00:00Z');
const auction = (overrides: Partial<BidContext> = {}): BidContext => ({
  status: AuctionStatus.ACTIVE,
  endsAt: new Date('2026-10-20T13:00:00Z'),
  startPriceMinor: 100_000,
  bidStepMinor: 5_000,
  currentPriceMinor: null,
  leaderId: null,
  sellerUserId: 'seller',
  ...overrides,
});

describe('minNextBid', () => {
  it('starts at the start price', () => {
    expect(minNextBid(auction())).toBe(100_000);
  });

  it('requires the current price plus one step afterwards', () => {
    expect(minNextBid(auction({ currentPriceMinor: 120_000 }))).toBe(125_000);
  });
});

describe('bidRejection', () => {
  it('accepts the start price as the first bid', () => {
    expect(bidRejection(auction(), 'buyer', 100_000, now)).toBeNull();
  });

  it('accepts exactly current price plus step', () => {
    expect(
      bidRejection(
        auction({ currentPriceMinor: 120_000, leaderId: 'other' }),
        'buyer',
        125_000,
        now,
      ),
    ).toBeNull();
  });

  it('rejects a bid below current price plus step with the minimum', () => {
    expect(
      bidRejection(
        auction({ currentPriceMinor: 120_000, leaderId: 'other' }),
        'buyer',
        124_999,
        now,
      ),
    ).toEqual({ code: 'TOO_LOW', minimumMinor: 125_000 });
  });

  it('rejects a first bid below the start price', () => {
    expect(bidRejection(auction(), 'buyer', 99_999, now)).toEqual({
      code: 'TOO_LOW',
      minimumMinor: 100_000,
    });
  });

  it('rejects bids at or after the deadline', () => {
    expect(bidRejection(auction({ endsAt: now }), 'buyer', 200_000, now)).toEqual({
      code: 'ENDED',
    });
  });

  it.each([
    AuctionStatus.AWAITING_CHECKOUT,
    AuctionStatus.SOLD,
    AuctionStatus.UNSOLD,
    AuctionStatus.CANCELLED,
  ])('rejects bids on a %s auction', (status) => {
    expect(bidRejection(auction({ status }), 'buyer', 200_000, now)).toEqual({
      code: 'NOT_ACTIVE',
    });
  });

  it('does not let the seller bid on their own lot', () => {
    expect(bidRejection(auction(), 'seller', 200_000, now)).toEqual({ code: 'OWN_LOT' });
  });

  it('does not let the leader outbid themselves', () => {
    expect(
      bidRejection(
        auction({ currentPriceMinor: 100_000, leaderId: 'buyer' }),
        'buyer',
        200_000,
        now,
      ),
    ).toEqual({ code: 'ALREADY_LEADING' });
  });
});

describe('relistedWindow', () => {
  it('keeps the original duration starting now', () => {
    const window = relistedWindow(
      new Date('2026-10-18T12:00:00Z'),
      new Date('2026-10-19T12:00:00Z'),
      now,
    );

    expect(window).toEqual({ startsAt: now, endsAt: new Date('2026-10-21T12:00:00Z') });
  });
});

describe('maskBidder', () => {
  it.each([
    ['Olena', 'O***'],
    ['  Ivan ', 'I***'],
    ['A', '*'],
  ])('masks %s as %s', (name, masked) => {
    expect(maskBidder(name)).toBe(masked);
  });
});
