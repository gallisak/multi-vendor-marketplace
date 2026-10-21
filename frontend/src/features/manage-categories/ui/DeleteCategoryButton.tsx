import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';
import { useDeleteCategory } from '../api/use-category-mutations';

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const remove = useDeleteCategory();
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Delete ${name}`}
      disabled={remove.isPending}
      onClick={() =>
        remove.mutate(id, {
          onSuccess: () => toast.success(`“${name}” deleted`),
          onError: (error) => toast.error(errorMessage(error)),
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
