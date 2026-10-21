import { useEffect, useState } from 'react';
import { type ProductUpdate, useRealtime } from '@/shared/realtime';

export function useLiveProduct(productId: string | undefined): ProductUpdate | null {
  const client = useRealtime();
  const [snapshot, setSnapshot] = useState<{ id: string; value: ProductUpdate } | null>(null);
  useEffect(() => {
    if (!productId) return;
    return client.subscribe('product', productId, (value) =>
      setSnapshot({ id: productId, value: value as ProductUpdate }),
    );
  }, [client, productId]);
  return snapshot && snapshot.id === productId ? snapshot.value : null;
}
