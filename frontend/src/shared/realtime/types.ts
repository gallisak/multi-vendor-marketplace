export type Channel = 'product' | 'auction';

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

export type Snapshot = ProductUpdate | AuctionUpdate;

export type SubscribeAck =
  { ok: true; channel: Channel; snapshot: Snapshot } | { ok: false; error: string };

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export const SERVER_EVENTS = {
  ready: 'ready',
  product: 'product.updated',
  auction: 'auction.updated',
  order: 'order.updated',
  sellerOrder: 'seller-order.updated',
  exception: 'exception',
} as const;
