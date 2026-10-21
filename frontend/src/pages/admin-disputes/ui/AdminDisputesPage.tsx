import { useSearchParams } from 'react-router';
import { useAdminDisputes } from '@/entities/dispute';
import { ResolveDisputeDialog } from '@/features/resolve-dispute';
import type { DisputeStatus } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { StatusFilter } from '@/shared/ui/status-filter';

const STATUSES: readonly DisputeStatus[] = [
  'OPEN',
  'RESOLVED_FOR_BUYER',
  'RESOLVED_FOR_SELLER',
  'CLOSED',
];

export function AdminDisputesPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const status = raw === 'ALL' ? undefined : ((raw as DisputeStatus | null) ?? 'OPEN');
  const disputes = useAdminDisputes(status);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Disputes"
        description="Payouts for a disputed order wait for the decision"
      />
      <StatusFilter
        statuses={STATUSES}
        value={status}
        onChange={(next) => setParams({ status: next ?? 'ALL' })}
      />
      {disputes.isPending ? (
        <LoadingState rows={3} label="Loading disputes" />
      ) : disputes.isError ? (
        <ErrorState error={disputes.error} onRetry={() => void disputes.refetch()} />
      ) : disputes.data.items.length === 0 ? (
        <EmptyState title="No disputes here" />
      ) : (
        <ul className="space-y-3">
          {disputes.data.items.map((dispute) => (
            <li key={dispute.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {dispute.storeName} <StatusBadge status={dispute.status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Order #{dispute.orderId.slice(0, 8)} · part{' '}
                    {dispute.sellerOrderStatus.toLowerCase()} ·{' '}
                    <Price minor={dispute.subtotalMinor} />
                    {dispute.refundedMinor > 0 && (
                      <>
                        {' '}
                        (<Price minor={dispute.refundedMinor} /> already refunded)
                      </>
                    )}{' '}
                    · opened {formatDateTime(dispute.createdAt)}
                  </p>
                </div>
                {dispute.status === 'OPEN' && <ResolveDisputeDialog dispute={dispute} />}
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
