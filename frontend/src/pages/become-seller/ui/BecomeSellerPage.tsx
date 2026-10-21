import { useEffect } from 'react';
import { Link } from 'react-router';
import { useMyApplications } from '@/entities/seller';
import { useAuth } from '@/entities/viewer';
import { SellerApplicationForm } from '@/features/apply-seller';
import { refreshSession } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function BecomeSellerPage() {
  const { user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const applications = useMyApplications(isCustomer);
  const latest = applications.data?.[0];
  const approved = latest?.status === 'APPROVED';

  useEffect(() => {
    if (approved && isCustomer) {
      void refreshSession();
    }
  }, [approved, isCustomer]);

  if (user?.role === 'SELLER') {
    return (
      <div className="space-y-4">
        <PageHeader title="You are a seller" />
        <Button asChild>
          <Link to="/seller">Open the seller dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Become a seller"
        description="An admin reviews every application before the store can list products"
      />
      {applications.isPending ? (
        <LoadingState rows={2} label="Loading applications" />
      ) : applications.isError ? (
        <ErrorState error={applications.error} onRetry={() => void applications.refetch()} />
      ) : (
        <>
          {latest && (
            <Alert variant={latest.status === 'REJECTED' ? 'destructive' : 'default'}>
              <AlertTitle className="flex items-center gap-2">
                {latest.storeName} <StatusBadge status={latest.status} />
              </AlertTitle>
              <AlertDescription>
                {latest.status === 'PENDING' &&
                  `Sent ${formatDateTime(latest.createdAt)}. You will get a notification once it is reviewed.`}
                {latest.status === 'APPROVED' && 'Approved, switching your account to seller...'}
                {latest.status === 'REJECTED' &&
                  `Rejected${latest.reviewNote ? `: ${latest.reviewNote}` : ''}. You can apply again.`}
              </AlertDescription>
            </Alert>
          )}
          {(!latest || latest.status === 'REJECTED') && <SellerApplicationForm />}
        </>
      )}
    </div>
  );
}
