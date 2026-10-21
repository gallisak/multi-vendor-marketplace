import { useSearchParams } from 'react-router';
import { useApplications } from '@/entities/seller';
import { ModerationActions } from '@/features/moderate';
import type { ApplicationStatus } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';
import { StatusFilter } from '@/shared/ui/status-filter';

const STATUSES: readonly ApplicationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const status = raw === 'ALL' ? undefined : ((raw as ApplicationStatus | null) ?? 'PENDING');
  const applications = useApplications(status);

  return (
    <div className="space-y-4">
      <PageHeader title="Seller applications" description="Oldest first" />
      <StatusFilter
        statuses={STATUSES}
        value={status}
        onChange={(next) => setParams({ status: next ?? 'ALL' })}
      />
      {applications.isPending ? (
        <LoadingState rows={3} label="Loading applications" />
      ) : applications.isError ? (
        <ErrorState error={applications.error} onRetry={() => void applications.refetch()} />
      ) : applications.data.items.length === 0 ? (
        <EmptyState title="No applications here" />
      ) : (
        <ul className="space-y-3">
          {applications.data.items.map((application) => (
            <li
              key={application.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 font-medium">
                  {application.storeName} <StatusBadge status={application.status} />
                </p>
                {application.description && (
                  <p className="text-sm text-muted-foreground">{application.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Sent {formatDateTime(application.createdAt)}
                  {application.reviewedAt &&
                    ` · reviewed ${formatDateTime(application.reviewedAt)}`}
                </p>
                {application.reviewNote && (
                  <p className="text-sm">Note: {application.reviewNote}</p>
                )}
              </div>
              {application.status === 'PENDING' && (
                <ModerationActions
                  target="seller-applications"
                  id={application.id}
                  name={application.storeName}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
