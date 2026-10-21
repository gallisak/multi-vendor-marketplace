import type { Review } from '@/shared/api';
import { formatDate } from '@/shared/lib';
import { Rating } from '@/shared/ui/rating';

export function ReviewItem({ review }: { review: Review }) {
  return (
    <li className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <Rating value={review.rating} />
        <span className="text-xs text-muted-foreground">
          {review.author} · {formatDate(review.createdAt)}
        </span>
      </div>
      {review.comment && <p className="mt-2 text-sm">{review.comment}</p>}
    </li>
  );
}
