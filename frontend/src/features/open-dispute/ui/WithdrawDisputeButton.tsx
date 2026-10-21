import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useWithdrawDispute } from '../api/use-dispute-actions';

export function WithdrawDisputeButton({ disputeId }: { disputeId: string }) {
  const withdraw = useWithdrawDispute();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={withdraw.isPending}
      onClick={() =>
        withdraw.mutate(disputeId, {
          onSuccess: () => toast.success('Dispute withdrawn'),
          onError: (error) => toast.error(errorMessage(error)),
        })
      }
    >
      Withdraw
    </Button>
  );
}
