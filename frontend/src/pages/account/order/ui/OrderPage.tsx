import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import {
  canCancelPart,
  canConfirmDelivery,
  canOpenDispute,
  canReviewItems,
  OrderItemsTable,
  SellerOrderSteps,
  useOrder,
} from '@/entities/order';
import { CancelPartDialog, ConfirmDeliveryButton } from '@/features/manage-order-part';
import { OpenDisputeDialog, WithdrawDisputeButton } from '@/features/open-dispute';
import { ReviewDialog } from '@/features/write-review';
import type { BuyerSellerOrder, Order, SellerOrderDispute } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { useConnectionStatus } from '@/shared/realtime';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { ConnectionDot } from '@/shared/ui/connection-dot';
import { Price } from '@/shared/ui/price';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

function DisputeNote({ dispute }: { dispute: SellerOrderDispute }) {
  return (
    <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          Dispute <StatusBadge status={dispute.status} />
        </span>
        {dispute.status === 'OPEN' && <WithdrawDisputeButton disputeId={dispute.id} />}
      </div>
      <p className="text-muted-foreground">{dispute.reason}</p>
      {dispute.resolutionNote && <p>Decision: {dispute.resolutionNote}</p>}
    </div>
  );
}

function SellerPart({ order, part }: { order: Order; part: BuyerSellerOrder }) {
  const reviewable = canReviewItems(part);
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {part.storeName} <StatusBadge status={part.status} />
          </span>
          <Price minor={part.subtotalMinor} />
        </CardTitle>
        <SellerOrderSteps status={part.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <OrderItemsTable
          items={part.items}
          action={
            reviewable
              ? (item) => <ReviewDialog productId={item.productId} title={item.title} />
              : undefined
          }
        />
        {part.refundedMinor > 0 && (
          <p className="text-sm text-orange-700">
            Refunded <Price minor={part.refundedMinor} />
          </p>
        )}
        {part.cancelReason && (
          <p className="text-sm text-muted-foreground">Cancelled: {part.cancelReason}</p>
        )}
        {part.dispute && <DisputeNote dispute={part.dispute} />}
        <div className="flex flex-wrap gap-2">
          {canConfirmDelivery(part) && (
            <ConfirmDeliveryButton orderId={order.id} sellerOrderId={part.id} />
          )}
          {canCancelPart(order, part) && (
            <CancelPartDialog
              orderId={order.id}
              sellerOrderId={part.id}
              storeName={part.storeName}
            />
          )}
          {canOpenDispute(order, part) && (
            <OpenDisputeDialog
              orderId={order.id}
              sellerOrderId={part.id}
              storeName={part.storeName}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const order = useOrder(id);
  const connection = useConnectionStatus();

  if (order.isPending) return <LoadingState rows={4} label="Loading order" />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;

  const data = order.data;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/account/orders">
          <ArrowLeft /> All orders
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Order #{data.id.slice(0, 8)} <StatusBadge status={data.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed {formatDateTime(data.createdAt)} · {data.sellerOrders.length} sellers · payment{' '}
            {data.paymentStatus.toLowerCase().replaceAll('_', ' ')}
          </p>
        </div>
        <ConnectionDot status={connection} />
      </div>

      {data.paymentStatus === 'PENDING' && (
        <Alert>
          <AlertDescription>
            Payment is being processed. This page updates automatically.
          </AlertDescription>
        </Alert>
      )}
      {data.paymentStatus === 'FAILED' && (
        <Alert variant="destructive">
          <AlertDescription>Payment failed, the order was cancelled.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {data.sellerOrders.map((part) => (
            <SellerPart key={part.id} order={data} part={part} />
          ))}
        </div>
        <aside>
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.sellerOrders.map((part) => (
                <div key={part.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">{part.storeName}</span>
                  <Price minor={part.subtotalMinor} />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <Price minor={data.totalMinor} />
              </div>
              {data.refundedMinor > 0 && (
                <>
                  <div className="flex justify-between text-orange-700">
                    <span>Refunded</span>
                    <span>
                      −<Price minor={data.refundedMinor} />
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Paid</span>
                    <Price minor={data.totalMinor - data.refundedMinor} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
