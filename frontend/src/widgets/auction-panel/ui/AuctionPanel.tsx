import { useEffect } from 'react';
import { useAuction, useLiveAuction, withLiveAuction } from '@/entities/auction';
import { useAuth } from '@/entities/viewer';
import { CheckoutAuctionButton } from '@/features/checkout-auction';
import { BidForm } from '@/features/place-bid';
import { formatDateTime, timeLeft, useNow } from '@/shared/lib';
import { Price } from '@/shared/ui/price';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function AuctionPanel({ productId }: { productId: string }) {
  const { user } = useAuth();
  const auction = useAuction(productId);
  const live = useLiveAuction(productId);
  const offset = auction.data
    ? new Date(auction.data.serverTime).getTime() - auction.dataUpdatedAt
    : 0;
  const now = useNow(1000, offset);
  const { refetch } = auction;
  const bidCount = live?.bidCount;

  useEffect(() => {
    if (bidCount !== undefined) void refetch();
  }, [bidCount, refetch]);

  if (auction.isPending) return <LoadingState rows={2} label="Loading auction" />;
  if (auction.isError) return <ErrorState error={auction.error} onRetry={() => void refetch()} />;

  const view = withLiveAuction(auction.data, live);
  const ended = view.status !== 'ACTIVE' || new Date(view.endsAt).getTime() <= now;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <StatusBadge status={view.status} />
        <span className="text-sm tabular-nums" aria-live="polite">
          {view.status === 'ACTIVE'
            ? `Ends in ${timeLeft(view.endsAt, now)}`
            : `Ended ${formatDateTime(view.endsAt)}`}
        </span>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {view.currentPriceMinor === null ? 'Starting price' : 'Current bid'}
        </p>
        <Price
          minor={view.currentPriceMinor ?? view.startPriceMinor}
          className="text-3xl font-semibold"
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {view.bidCount} bids{view.leader ? `, leading: ${view.leader}` : ''} · step{' '}
          <Price minor={view.bidStepMinor} />
        </p>
      </div>
      {!ended ? (
        <BidForm productId={productId} minimumMinor={view.minNextBidMinor} />
      ) : view.status === 'AWAITING_CHECKOUT' ? (
        <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
          <p>
            The winner can buy the lot at the winning price until{' '}
            {view.checkoutDeadline && formatDateTime(view.checkoutDeadline)}.
          </p>
          {user && <CheckoutAuctionButton productId={productId} />}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Bidding is closed.</p>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent bids</h3>
        {view.recentBids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bids yet, be the first.</p>
        ) : (
          <ul className="divide-y text-sm">
            {view.recentBids.map((bid) => (
              <li
                key={`${bid.createdAt}-${bid.amountMinor}`}
                className="flex justify-between py-1.5"
              >
                <span>{bid.bidder}</span>
                <span className="flex gap-3">
                  <span className="text-muted-foreground">{formatDateTime(bid.createdAt)}</span>
                  <Price minor={bid.amountMinor} className="font-medium" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
