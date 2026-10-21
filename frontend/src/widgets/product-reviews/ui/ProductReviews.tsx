import { useState } from 'react';
import { ReviewItem, useReviews } from '@/entities/review';
import { useAuth } from '@/entities/viewer';
import { ReviewForm } from '@/features/write-review';
import { Pager } from '@/shared/ui/pager';
import { Rating } from '@/shared/ui/rating';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';

export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const reviews = useReviews(productId, page);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {reviews.data && <Rating value={reviews.data.ratingAvg} count={reviews.data.ratingCount} />}
      </div>
      {user && <ReviewForm productId={productId} />}
      {reviews.isPending ? (
        <LoadingState rows={2} label="Loading reviews" />
      ) : reviews.isError ? (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
      ) : reviews.data.items.length === 0 ? (
        <EmptyState title="No reviews yet" />
      ) : (
        <>
          <ul className="space-y-3">
            {reviews.data.items.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </ul>
          <Pager
            page={reviews.data.page}
            limit={reviews.data.limit}
            total={reviews.data.total}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
