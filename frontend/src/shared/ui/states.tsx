import { AlertTriangle, Inbox, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { Skeleton } from './skeleton';
import { ApiError } from '@/shared/api';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.details.length > 1 ? error.details.join('; ') : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function LoadingState({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Inbox className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const correlationId = error instanceof ApiError ? error.correlationId : undefined;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium">{errorMessage(error)}</p>
      {correlationId && (
        <p className="text-xs text-muted-foreground">Request ID: {correlationId}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}
