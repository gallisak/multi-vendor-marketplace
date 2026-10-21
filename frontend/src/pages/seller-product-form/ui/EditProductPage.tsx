import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useSellerProduct } from '@/entities/seller';
import { EditProductForm } from '@/features/manage-product';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { StatusBadge } from '@/shared/ui/status-badge';

export function EditProductPage() {
  const { id } = useParams();
  const product = useSellerProduct(id);

  if (product.isPending) return <LoadingState rows={4} label="Loading product" />;
  if (product.isError) {
    return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
  }

  const data = product.data;
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/seller/products">
          <ArrowLeft /> All products
        </Link>
      </Button>
      <PageHeader
        title="Edit product"
        description={
          data.type === 'AUCTION' ? 'Auction lot, the price is driven by bids' : undefined
        }
        actions={<StatusBadge status={data.status} />}
      />
      {data.status === 'REJECTED' && data.moderationNote && (
        <Alert variant="destructive">
          <AlertDescription>
            Rejected by moderation: {data.moderationNote}. Saving sends it back for review.
          </AlertDescription>
        </Alert>
      )}
      <EditProductForm key={data.id} product={data} />
    </div>
  );
}
