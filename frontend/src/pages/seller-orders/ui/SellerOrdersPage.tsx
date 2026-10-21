import { Link, useSearchParams } from 'react-router';
import { useSellerOrders } from '@/entities/order';
import type { SellerOrderStatus } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { Pager } from '@/shared/ui/pager';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { StatusFilter } from '@/shared/ui/status-filter';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const STATUSES: readonly SellerOrderStatus[] = [
  'NEW',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
];

export function SellerOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as SellerOrderStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? '1');
  const orders = useSellerOrders(status, page);

  const update = (next: { status?: SellerOrderStatus; page?: number }) => {
    const search = new URLSearchParams();
    if (next.status) search.set('status', next.status);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    setParams(search);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description="Only the part of each order that you sell" />
      <StatusFilter
        statuses={STATUSES}
        value={status}
        onChange={(next) => update({ status: next })}
      />
      {orders.isPending ? (
        <LoadingState rows={4} label="Loading orders" />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.items.length === 0 ? (
        <EmptyState title="No orders here" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Your payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link to={`/seller/orders/${order.id}`} className="font-medium hover:underline">
                      #{order.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="space-x-1">
                    <StatusBadge status={order.status} />
                    {order.paymentStatus === 'PENDING' && <StatusBadge status="PENDING" />}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Price minor={order.subtotalMinor} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Price minor={order.payoutMinor} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager
            page={page}
            limit={orders.data.limit}
            total={orders.data.total}
            onChange={(next) => update({ status, page: next })}
          />
        </>
      )}
    </div>
  );
}
