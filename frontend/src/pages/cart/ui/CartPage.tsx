import { Link } from 'react-router';
import { toast } from 'sonner';
import { CartLineRow, useCart, useSetCartItem } from '@/entities/cart';
import { PlaceOrderButton } from '@/features/checkout';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, errorMessage, LoadingState } from '@/shared/ui/states';

export function CartPage() {
  const cart = useCart(true);
  const setItem = useSetCartItem();

  if (cart.isPending) return <LoadingState rows={3} label="Loading cart" />;
  if (cart.isError) return <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />;

  const data = cart.data;
  if (data.sellers.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        action={
          <Button asChild size="sm">
            <Link to="/">Browse the catalog</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <PageHeader
          title="Cart"
          description={`${data.itemsCount} items from ${data.sellers.length} sellers`}
        />
        {data.sellers.map((group) => (
          <Card key={group.sellerId}>
            <CardHeader>
              <CardTitle className="flex justify-between text-base">
                <span>{group.storeName}</span>
                <Price minor={group.subtotalMinor} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {group.items.map((line) => (
                  <CartLineRow
                    key={line.productId}
                    line={line}
                    onQuantity={(quantity) =>
                      setItem.mutate(
                        { productId: line.productId, quantity },
                        { onError: (error) => toast.error(errorMessage(error)) },
                      )
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <aside>
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.sellers.map((group) => (
              <div key={group.sellerId} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{group.storeName}</span>
                <Price minor={group.subtotalMinor} />
              </div>
            ))}
            <div className="flex justify-between border-t pt-3 font-semibold">
              <span>Total</span>
              <Price minor={data.totalMinor} />
            </div>
            {data.hasUnavailableItems && (
              <Alert variant="destructive">
                <AlertDescription>Remove unavailable items to check out.</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Each seller ships separately, so you will get one order with a part per seller.
            </p>
            <PlaceOrderButton
              cart={data}
              disabled={setItem.isPending}
              onRejected={() => void cart.refetch()}
            />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
