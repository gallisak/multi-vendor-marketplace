import { Check } from 'lucide-react';
import type { SellerOrderStatus } from '@/shared/api';
import { cn } from '@/shared/lib';

const FLOW: SellerOrderStatus[] = ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED'];
const LABELS: Record<SellerOrderStatus, string> = {
  NEW: 'New',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function SellerOrderSteps({ status }: { status: SellerOrderStatus }) {
  if (status === 'CANCELLED') return null;
  const reached = FLOW.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Order progress">
      {FLOW.map((step, index) => (
        <li
          key={step}
          aria-current={index === reached ? 'step' : undefined}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5',
            index <= reached
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'text-muted-foreground',
          )}
        >
          {index < reached && <Check className="size-3" />}
          {LABELS[step]}
        </li>
      ))}
    </ol>
  );
}
