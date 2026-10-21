import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useOrders } from '@/entities/order';
import { formatDateTime } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { Pager } from '@/shared/ui/pager';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const orders = useOrders(page);

  return (
    <div className="space-y-4">
      <PageHeader title="My orders" description="Each order is split into parts, one per seller" />
      {orders.isPending ? (
        <LoadingState rows={4} label="Loading orders" />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          title="No orders yet"
          action={
            <Button asChild size="sm">
              <Link to="/">Browse the catalog</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {orders.data.items.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/account/orders/${order.id}`}
                  className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">#{order.id.slice(0, 8)}</span>
                      <StatusBadge status={order.status} />
                      {order.paymentStatus !== 'CAPTURED' && (
                        <StatusBadge status={order.paymentStatus} />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </span>
                    </div>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {order.sellerOrders.map((part) => (
                        <li key={part.id} className="flex items-center gap-1.5">
                          {part.storeName}
                          <StatusBadge status={part.status} className="h-4 text-[10px]" />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-right">
                    <Price minor={order.totalMinor} className="font-semibold" />
                    {order.refundedMinor > 0 && (
                      <p className="text-xs text-orange-700">
                        −<Price minor={order.refundedMinor} /> refunded
                      </p>
                    )}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <Pager
            page={page}
            limit={orders.data.limit}
            total={orders.data.total}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
