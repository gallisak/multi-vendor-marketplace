import { Badge } from './badge';
import { humanize } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

const TONES: Record<string, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  PENDING: 'bg-amber-100 text-amber-800',
  PENDING_MODERATION: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  PARTIALLY_SHIPPED: 'bg-violet-100 text-violet-800',
  SHIPPED: 'bg-violet-100 text-violet-800',
  PARTIALLY_COMPLETED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CAPTURED: 'bg-emerald-100 text-emerald-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  RESOLVED_FOR_BUYER: 'bg-emerald-100 text-emerald-800',
  RESOLVED_FOR_SELLER: 'bg-slate-200 text-slate-800',
  AWAITING_CHECKOUT: 'bg-amber-100 text-amber-800',
  SOLD: 'bg-slate-200 text-slate-800',
  SOLD_OUT: 'bg-slate-200 text-slate-800',
  PARTIALLY_REFUNDED: 'bg-orange-100 text-orange-800',
  REFUNDED: 'bg-orange-100 text-orange-800',
  OPEN: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
  FAILED: 'bg-rose-100 text-rose-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  UNSOLD: 'bg-slate-200 text-slate-800',
  ARCHIVED: 'bg-slate-200 text-slate-800',
  CLOSED: 'bg-slate-200 text-slate-800',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={cn(TONES[status] ?? 'bg-secondary text-secondary-foreground', className)}>
      {humanize(status)}
    </Badge>
  );
}
