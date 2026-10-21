import { Link } from 'react-router';
import { useSellerDisputes } from '@/entities/dispute';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function SellerDisputesPage() {
  const disputes = useSellerDisputes();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Disputes"
        description="Buyers' complaints about your orders. An admin makes the final decision."
      />
      {disputes.isPending ? (
        <LoadingState rows={3} label="Loading disputes" />
      ) : disputes.isError ? (
        <ErrorState error={disputes.error} onRetry={() => void disputes.refetch()} />
      ) : disputes.data.items.length === 0 ? (
        <EmptyState title="No disputes" />
      ) : (
        <ul className="space-y-3">
          {disputes.data.items.map((dispute) => (
            <li key={dispute.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={dispute.status} />
                <Link
                  to={`/seller/orders/${dispute.sellerOrderId}`}
                  className="text-sm font-medium hover:underline"
                >
                  Order #{dispute.sellerOrderId.slice(0, 8)}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(dispute.createdAt)}
                </span>
              </div>
              <p className="text-sm">{dispute.reason}</p>
              {dispute.resolutionNote && (
                <p className="text-sm text-muted-foreground">Decision: {dispute.resolutionNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
