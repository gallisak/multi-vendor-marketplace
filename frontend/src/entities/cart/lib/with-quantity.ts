import type { Cart } from '@/shared/api';

export function withQuantity(cart: Cart, productId: string, quantity: number): Cart {
  const sellers = cart.sellers
    .map((group) => {
      const items = group.items
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity, lineTotalMinor: line.unitPriceMinor * quantity }
            : line,
        )
        .filter((line) => line.quantity > 0);
      const subtotalMinor = items
        .filter((line) => line.available)
        .reduce((sum, line) => sum + line.lineTotalMinor, 0);
      return { ...group, items, subtotalMinor };
    })
    .filter((group) => group.items.length > 0);
  return {
    ...cart,
    sellers,
    totalMinor: sellers.reduce((sum, group) => sum + group.subtotalMinor, 0),
    itemsCount: sellers.reduce(
      (sum, group) => sum + group.items.reduce((count, line) => count + line.quantity, 0),
      0,
    ),
  };
}

export function quantityInCart(cart: Cart | undefined, productId: string): number {
  return (
    cart?.sellers.flatMap((group) => group.items).find((line) => line.productId === productId)
      ?.quantity ?? 0
  );
}
