import { cn } from '@/shared/lib/utils';

export type ConnectionState = 'online' | 'connecting' | 'offline';

const LABELS: Record<ConnectionState, string> = {
  online: 'Live',
  connecting: 'Reconnecting',
  offline: 'Offline',
};

export function ConnectionDot({ status }: { status: ConnectionState }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title="Live updates"
    >
      <span
        className={cn(
          'size-2 rounded-full',
          status === 'online' && 'bg-emerald-500',
          status === 'connecting' && 'animate-pulse bg-amber-500',
          status === 'offline' && 'bg-rose-500',
        )}
      />
      {LABELS[status]}
    </span>
  );
}
