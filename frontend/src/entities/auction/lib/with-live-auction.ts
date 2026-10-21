import type { AuctionView } from '@/shared/api';
import type { AuctionUpdate } from '@/shared/realtime';

export function withLiveAuction(view: AuctionView, live: AuctionUpdate | null): AuctionView {
  if (!live) return view;
  return {
    ...view,
    status: live.status as AuctionView['status'],
    currentPriceMinor: live.currentPriceMinor,
    minNextBidMinor: live.minNextBidMinor,
    bidCount: live.bidCount,
    leader: live.leader,
    endsAt: live.endsAt,
    checkoutDeadline: live.checkoutDeadline,
  };
}
