import { type ReactNode, useEffect } from 'react';
import { useAuction, useLiveAuction, withLiveAuction } from '@/entities/auction';
import { CheckoutAuctionButton } from '@/features/checkout-auction';
import { BidForm } from '@/features/place-bid';
import { formatDateTime, timeLeft, useNow } from '@/shared/lib';
import { Price } from '@/shared/ui/price';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-muted p-3 text-sm">{children}</div>;
}

export function AuctionPanel({ productId }: { productId: string }) {
  const auction = useAuction(productId);
  const live = useLiveAuction(productId);
  const offset = auction.data
    ? new Date(auction.data.serverTime).getTime() - auction.dataUpdatedAt
    : 0;
  const now = useNow(1000, offset);
  const { refetch } = auction;
  const bidCount = live?.bidCount;
  const liveStatus = live?.status;

  useEffect(() => {
    if (bidCount !== undefined || liveStatus !== undefined) void refetch();
  }, [bidCount, liveStatus, refetch]);

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
        view.viewer?.isSeller ? (
          <Note>This is your lot. Bids appear here live.</Note>
        ) : view.viewer?.isLeader ? (
          <Note>Your bid is the highest. We will notify you if someone outbids you.</Note>
        ) : (
          <BidForm productId={productId} minimumMinor={view.minNextBidMinor} />
        )
      ) : view.status === 'AWAITING_CHECKOUT' ? (
        view.viewer?.isWinner ? (
          <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            <p>
              You won. Buy the lot at the winning price until{' '}
              {view.checkoutDeadline && formatDateTime(view.checkoutDeadline)}.
            </p>
            <CheckoutAuctionButton productId={productId} />
          </div>
        ) : (
          <Note>
            The lot is reserved for the winner until{' '}
            {view.checkoutDeadline && formatDateTime(view.checkoutDeadline)}. If they do not buy it,
            the auction starts again.
          </Note>
        )
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
