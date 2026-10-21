import { useEffect, useState } from 'react';
import { type AuctionUpdate, useRealtime } from '@/shared/realtime';

export function useLiveAuction(productId: string | undefined): AuctionUpdate | null {
  const client = useRealtime();
  const [snapshot, setSnapshot] = useState<{ id: string; value: AuctionUpdate } | null>(null);
  useEffect(() => {
    if (!productId) return;
    return client.subscribe('auction', productId, (value) =>
      setSnapshot({ id: productId, value: value as AuctionUpdate }),
    );
  }, [client, productId]);
  return snapshot && snapshot.id === productId ? snapshot.value : null;
}
