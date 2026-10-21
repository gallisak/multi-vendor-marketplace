import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/entities/viewer';
import type { Role } from '@/shared/api';
import { EmptyState, LoadingState } from '@/shared/ui/states';

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return <LoadingState rows={2} label="Checking your session" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState
        title="You do not have access to this page"
        description="This section is available to other roles."
      />
    );
  }
  return children;
}
