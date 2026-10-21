import { cn } from '@/shared/lib/utils';
import { formatMoney } from '@/shared/lib/money';

export function Price({ minor, className }: { minor: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(minor)}</span>;
}
