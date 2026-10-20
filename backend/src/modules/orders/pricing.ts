export const BPS_DENOMINATOR = 10_000n;

export interface PricedLine {
  productId: string;
  sellerId: string;
  title: string;
  unitPriceMinor: number;
  quantity: number;
}

export interface SellerOrderDraft {
  sellerId: string;
  lines: PricedLine[];
  subtotalMinor: bigint;
  commissionRateBps: number;
  commissionMinor: bigint;
}

export interface OrderDraft {
  sellerOrders: SellerOrderDraft[];
  totalMinor: bigint;
  commissionMinor: bigint;
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function commissionFor(subtotalMinor: bigint, rateBps: number): bigint {
  return (subtotalMinor * BigInt(rateBps) + BPS_DENOMINATOR / 2n) / BPS_DENOMINATOR;
}

export function lineTotal(line: Pick<PricedLine, 'unitPriceMinor' | 'quantity'>): bigint {
  return BigInt(line.unitPriceMinor) * BigInt(line.quantity);
}

export function splitBySeller(lines: PricedLine[], commissionRateBps: number): OrderDraft {
  const bySeller = new Map<string, PricedLine[]>();
  for (const line of lines) {
    bySeller.set(line.sellerId, [...(bySeller.get(line.sellerId) ?? []), line]);
  }

  const sellerOrders = [...bySeller.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sellerId, sellerLines]) => {
      const subtotalMinor = sellerLines.reduce((sum, line) => sum + lineTotal(line), 0n);
      return {
        sellerId,
        lines: sellerLines,
        subtotalMinor,
        commissionRateBps,
        commissionMinor: commissionFor(subtotalMinor, commissionRateBps),
      };
    });

  return {
    sellerOrders,
    totalMinor: sellerOrders.reduce((sum, order) => sum + order.subtotalMinor, 0n),
    commissionMinor: sellerOrders.reduce((sum, order) => sum + order.commissionMinor, 0n),
  };
}
