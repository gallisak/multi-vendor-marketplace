import { Star } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { ReviewForm } from './ReviewForm';

export function ReviewDialog({ productId, title }: { productId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Star /> Review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Review “{title}”</DialogTitle>
          <DialogDescription>Your review updates the product rating right away.</DialogDescription>
        </DialogHeader>
        <ReviewForm productId={productId} bordered={false} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
