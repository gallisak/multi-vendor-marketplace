import { useMutation } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';

export function ReindexButton() {
  const reindex = useMutation({
    mutationFn: () => api<{ jobId: string }>('/admin/search/reindex', { method: 'POST' }),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={reindex.isPending}
      onClick={() =>
        reindex.mutate(undefined, {
          onSuccess: () => toast.success('Full search reindex scheduled'),
          onError: (error) => toast.error(errorMessage(error)),
        })
      }
    >
      <RefreshCw /> Rebuild search index
    </Button>
  );
}
