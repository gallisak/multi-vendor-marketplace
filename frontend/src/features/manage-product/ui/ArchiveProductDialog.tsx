import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { errorMessage } from '@/shared/ui/states';
import { useArchiveProduct } from '../api/use-product-mutations';

export function ArchiveProductDialog({ productId, title }: { productId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const archive = useArchiveProduct(productId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Archive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Archive “{title}”?</DialogTitle>
          <DialogDescription>
            The product leaves the catalog. Buyers who already have it in the cart will see it as
            unavailable. Existing orders are not affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Product archived');
                  setOpen(false);
                },
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
