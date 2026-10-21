import { CreateProductForm } from '@/features/manage-product';
import { PageHeader } from '@/shared/ui/page-header';

export function NewProductPage() {
  return (
    <div>
      <PageHeader title="New product" />
      <CreateProductForm />
    </div>
  );
}
