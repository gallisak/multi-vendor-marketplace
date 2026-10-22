import { Link } from 'react-router';
import { useLiveAuction } from '@/entities/auction';
import { useSellerDashboard } from '@/entities/seller';
import type { SellerDashboard, SellerOrderStatus } from '@/shared/api';
import { formatDateTime, formatMoney, humanize, timeLeft, useNow } from '@/shared/lib';
import { useConnectionStatus } from '@/shared/realtime';
import { Button } from '@/shared/ui/button';
import { ConnectionDot } from '@/shared/ui/connection-dot';
import { PageHeader } from '@/shared/ui/page-header';
import { Price } from '@/shared/ui/price';
import { StatTile } from '@/shared/ui/stat-tile';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const ORDER_STATUSES: SellerOrderStatus[] = [
  'NEW',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
];

type DashboardAuction = SellerDashboard['auctions'][number];

function AuctionRow({ auction, now }: { auction: DashboardAuction; now: number }) {
  const live = useLiveAuction(auction.productId);
  const current = live ?? auction;
  const deadline =
    current.status === 'AWAITING_CHECKOUT' ? current.checkoutDeadline : current.endsAt;
  return (
    <TableRow>
      <TableCell className="max-w-64 truncate">
        <Link to={`/products/${auction.productId}`} className="hover:underline">
          {auction.title}
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={current.status} />
      </TableCell>
      <TableCell className="text-right">
        {current.currentPriceMinor === null ? (
          <span className="text-muted-foreground">No bids</span>
        ) : (
          <Price minor={current.currentPriceMinor} className="font-medium" />
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{current.bidCount}</TableCell>
      <TableCell className="text-right tabular-nums">
        {deadline ? timeLeft(deadline, now) : '—'}
      </TableCell>
    </TableRow>
  );
}

export function SellerDashboardPage() {
  const dashboard = useSellerDashboard();
  const connection = useConnectionStatus();
  const now = useNow();

  if (dashboard.isPending) return <LoadingState rows={4} label="Loading dashboard" />;
  if (dashboard.isError) {
    return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }

  const { revenue, payouts, sellerOrders, auctions, recentOrders } = dashboard.data;
  const last30 = revenue.last30Days;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        actions={
          <Button asChild size="sm">
            <Link to="/seller/products/new">New product</Link>
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Last 30 days</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Net sales"
            value={formatMoney(last30.grossMinor - last30.refundedMinor)}
            hint={`${formatMoney(last30.grossMinor)} gross, ${formatMoney(last30.refundedMinor)} refunded`}
          />
          <StatTile label="Platform commission" value={formatMoney(last30.commissionMinor)} />
          <StatTile label="Your earnings" value={formatMoney(last30.payoutMinor)} />
          <StatTile
            label="Payouts"
            value={formatMoney(payouts.pendingMinor)}
            hint={`pending · ${formatMoney(payouts.inTransitMinor)} in transit · ${formatMoney(payouts.paidOutMinor)} paid out`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          All time: {formatMoney(revenue.allTime.payoutMinor)} earned from{' '}
          {formatMoney(revenue.allTime.grossMinor - revenue.allTime.refundedMinor)} net sales.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Orders</h2>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((status) => (
            <Link
              key={status}
              to={`/seller/orders?status=${status}`}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            >
              {humanize(status)}
              <span className="font-semibold tabular-nums">{sellerOrders[status] ?? 0}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Your auctions</h2>
          <ConnectionDot status={connection} />
        </div>
        {auctions.length === 0 ? (
          <EmptyState
            title="No running auctions"
            description="Create a product of the auction type to start one."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Current bid</TableHead>
                <TableHead className="text-right">Bids</TableHead>
                <TableHead className="text-right">Time left</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auctions.map((auction) => (
                <AuctionRow key={auction.productId} auction={auction} now={now} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent orders</h2>
        {recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <ul className="divide-y rounded-xl border">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/seller/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    #{order.id.slice(0, 8)} <StatusBadge status={order.status} />
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                  <Price minor={order.subtotalMinor} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
