export const REALTIME_NAMESPACE = '/realtime';

export const CHANNELS = ['product', 'auction'] as const;
export type Channel = (typeof CHANNELS)[number];

export const room = {
  product: (productId: string) => `product:${productId}`,
  auction: (productId: string) => `auction:${productId}`,
  user: (userId: string) => `user:${userId}`,
};

export const SERVER_EVENTS = {
  ready: 'ready',
  product: 'product.updated',
  auction: 'auction.updated',
  order: 'order.updated',
  sellerOrder: 'seller-order.updated',
} as const;

export interface ProductUpdate {
  productId: string;
  version: number;
  status: string;
  stock: number;
  inStock: boolean;
  priceMinor: number;
}

export interface AuctionUpdate {
  productId: string;
  auctionId: string;
  version: number;
  status: string;
  currentPriceMinor: number | null;
  minNextBidMinor: number;
  bidCount: number;
  leader: string | null;
  endsAt: string;
  checkoutDeadline: string | null;
}

export interface OrderUpdate {
  orderId: string;
  version: number;
  status: string;
  paymentStatus: string;
  totalMinor: number;
  refundedMinor: number;
  sellerOrders: { id: string; status: string; version: number }[];
}

export interface SellerOrderUpdate {
  sellerOrderId: string;
  orderId: string;
  version: number;
  status: string;
  paymentStatus: string;
  refundedMinor: number;
}

export type SubscribeAck =
  | { ok: true; channel: Channel; snapshot: ProductUpdate | AuctionUpdate }
  | { ok: false; error: string };

export function isNewer(incoming: { version: number }, current?: { version: number }): boolean {
  return current === undefined || incoming.version > current.version;
}
