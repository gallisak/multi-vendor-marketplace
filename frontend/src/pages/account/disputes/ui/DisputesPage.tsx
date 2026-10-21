import { Link } from 'react-router';
import { useMyDisputes } from '@/entities/dispute';
import { WithdrawDisputeButton } from '@/features/open-dispute';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function DisputesPage() {
  const disputes = useMyDisputes();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Disputes"
        description="Open a dispute from an order once the seller has shipped it"
      />
      {disputes.isPending ? (
        <LoadingState rows={3} label="Loading disputes" />
      ) : disputes.isError ? (
        <ErrorState error={disputes.error} onRetry={() => void disputes.refetch()} />
      ) : disputes.data.items.length === 0 ? (
        <EmptyState title="No disputes" description="Hopefully it stays this way." />
      ) : (
        <ul className="space-y-3">
          {disputes.data.items.map((dispute) => (
            <li key={dispute.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={dispute.status} />
                  <Link
                    to={`/account/orders/${dispute.orderId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    Order #{dispute.orderId.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(dispute.createdAt)}
                  </span>
                </div>
                {dispute.status === 'OPEN' && <WithdrawDisputeButton disputeId={dispute.id} />}
              </div>
              <p className="text-sm">{dispute.reason}</p>
              {dispute.resolutionNote && (
                <p className="text-sm text-muted-foreground">
                  Decision{dispute.resolvedAt ? ` (${formatDateTime(dispute.resolvedAt)})` : ''}:{' '}
                  {dispute.resolutionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
