import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { netCommission, OrderItemsTable, SellerOrderSteps, useSellerOrder } from '@/entities/order';
import {
  canRefund,
  canSellerCancel,
  RefundDialog,
  refundableQuantity,
  SellerCancelDialog,
  SellerOrderActions,
} from '@/features/fulfil-seller-order';
import { formatDateTime } from '@/shared/lib';
import { useConnectionStatus } from '@/shared/realtime';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { ConnectionDot } from '@/shared/ui/connection-dot';
import { Price } from '@/shared/ui/price';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function SellerOrderPage() {
  const { id } = useParams();
  const query = useSellerOrder(id);
  const connection = useConnectionStatus();

  if (query.isPending) return <LoadingState rows={4} label="Loading order" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const order = query.data;
  const refundable = canRefund(order);
  const commissionPercent = order.commissionRateBps / 100;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/seller/orders">
          <ArrowLeft /> All orders
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Order #{order.id.slice(0, 8)} <StatusBadge status={order.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed {formatDateTime(order.createdAt)} · updated {formatDateTime(order.updatedAt)}
          </p>
          <SellerOrderSteps status={order.status} />
        </div>
        <ConnectionDot status={connection} />
      </div>

      {order.paymentStatus === 'PENDING' && (
        <Alert>
          <AlertDescription>
            The buyer's payment is being processed. You can accept the order once it is captured.
          </AlertDescription>
        </Alert>
      )}
      {order.cancelReason && (
        <Alert variant="destructive">
          <AlertDescription>Cancelled: {order.cancelReason}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <OrderItemsTable
                items={order.items}
                action={
                  refundable
                    ? (item) =>
                        refundableQuantity(item) > 0 ? (
                          <RefundDialog order={order} item={item} />
                        ) : null
                    : undefined
                }
              />
              <div className="flex flex-wrap gap-2">
                <SellerOrderActions order={order} />
                {canSellerCancel(order) && <SellerCancelDialog sellerOrderId={order.id} />}
              </div>
            </CardContent>
          </Card>

          {order.refunds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refunds</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {order.refunds.map((refund) => {
                    const item = order.items.find(
                      (candidate) => candidate.id === refund.orderItemId,
                    );
                    return (
                      <li key={refund.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>
                          {refund.quantity} × {item?.title ?? 'item'}
                          {refund.reason && (
                            <span className="text-muted-foreground"> · {refund.reason}</span>
                          )}
                        </span>
                        <span className="text-right">
                          −<Price minor={refund.amountMinor} />
                          <span className="block text-xs text-muted-foreground">
                            commission back <Price minor={refund.commissionReversalMinor} /> ·{' '}
                            {formatDateTime(refund.createdAt)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <aside>
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Money</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <Price minor={order.subtotalMinor} />
              </div>
              {order.refundedMinor > 0 && (
                <div className="flex justify-between text-orange-700">
                  <span>Refunded</span>
                  <span>
                    −<Price minor={order.refundedMinor} />
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Platform commission ({commissionPercent}%)
                </span>
                <span>
                  −<Price minor={netCommission(order)} />
                </span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Your payout</span>
                <Price minor={order.payoutMinor} />
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Payment {order.paymentStatus.toLowerCase().replaceAll('_', ' ')}. Payouts are sent
                after the hold period.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
