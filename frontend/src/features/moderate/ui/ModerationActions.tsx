import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SellerApplication, SellerProduct } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { NoteDialog } from '@/shared/ui/note-dialog';
import { errorMessage } from '@/shared/ui/states';
import { useModeration } from '../api/use-moderation';

const COPY = {
  'seller-applications': {
    approved: 'Seller approved, the user can now list products',
    rejected: 'Application rejected',
    rejectTitle: 'Reject this application?',
  },
  products: {
    approved: 'Product published to the catalog',
    rejected: 'Product rejected, the seller sees your note',
    rejectTitle: 'Reject this product?',
  },
} as const;

export function ModerationActions({
  target,
  id,
  name,
}: {
  target: 'seller-applications' | 'products';
  id: string;
  name: string;
}) {
  const moderation = useModeration<SellerApplication | SellerProduct>(target);
  const copy = COPY[target];

  const decide = (decision: 'approve' | 'reject', note?: string) =>
    moderation.mutateAsync(
      { id, decision, note },
      {
        onSuccess: () => toast.success(decision === 'approve' ? copy.approved : copy.rejected),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <div className="flex justify-end gap-1">
      <Button
        size="sm"
        disabled={moderation.isPending}
        onClick={() => void decide('approve').catch(() => undefined)}
      >
        <Check /> Approve
      </Button>
      <NoteDialog
        trigger={
          <Button size="sm" variant="outline" disabled={moderation.isPending}>
            <X /> Reject
          </Button>
        }
        title={copy.rejectTitle}
        description={`“${name}”. The note is shown to the seller.`}
        label="Reason"
        confirmLabel="Reject"
        destructive
        minLength={3}
        pending={moderation.isPending}
        onConfirm={(note) => decide('reject', note)}
      />
    </div>
  );
}
