export type Role = 'CUSTOMER' | 'SELLER' | 'ADMIN';
export type ProductType = 'FIXED_PRICE' | 'AUCTION';
export type ProductStatus =
  'DRAFT' | 'PENDING_MODERATION' | 'ACTIVE' | 'REJECTED' | 'SOLD_OUT' | 'ARCHIVED';
export type AuctionStatus = 'ACTIVE' | 'AWAITING_CHECKOUT' | 'SOLD' | 'UNSOLD' | 'CANCELLED';
export type OrderStatus =
  | 'NEW'
  | 'PROCESSING'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'CANCELLED';
export type SellerOrderStatus = 'NEW' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'CAPTURED' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type DisputeStatus = 'OPEN' | 'RESOLVED_FOR_BUYER' | 'RESOLVED_FOR_SELLER' | 'CLOSED';
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: Category[];
}

export interface ProductAuction {
  startPriceMinor: number;
  bidStepMinor: number;
  currentPriceMinor: number | null;
  bidCount: number;
  endsAt: string;
  status: AuctionStatus;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  type: ProductType;
  status: ProductStatus;
  priceMinor: number;
  stock: number;
  imageUrls: string[];
  ratingAvg: number;
  ratingCount: number;
  category: { id: string; name: string; slug: string };
  seller: { id: string; storeName: string };
  auction: ProductAuction | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerProduct extends Product {
  moderationNote: string | null;
  version: number;
}

export interface SearchHit {
  id: string;
  title: string;
  type: ProductType;
  priceMinor: number;
  stock: number;
  inStock: boolean;
  imageUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  categoryId: string;
  categoryName: string;
  sellerId: string;
  sellerName: string;
  auctionEndsAt: number | null;
}

export type FacetName = 'categoryIds' | 'sellerId' | 'type' | 'inStock';

export interface SearchResult extends Page<SearchHit> {
  facets: Record<FacetName, Record<string, number>>;
  priceRange: { min: number; max: number } | null;
  source: 'search' | 'database';
  degraded: boolean;
}

export type UnavailableReason =
  | 'ARCHIVED'
  | 'NOT_ACTIVE'
  | 'SELLER_INACTIVE'
  | 'AUCTION'
  | 'OWN_PRODUCT'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK';

export interface CartLine {
  productId: string;
  title: string;
  imageUrl: string | null;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  stock: number;
  available: boolean;
  unavailableReason: UnavailableReason | null;
}

export interface CartSellerGroup {
  sellerId: string;
  storeName: string;
  items: CartLine[];
  subtotalMinor: number;
}

export interface Cart {
  sellers: CartSellerGroup[];
  totalMinor: number;
  itemsCount: number;
  hasUnavailableItems: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  title: string;
  unitPriceMinor: number;
  quantity: number;
  refundedQuantity: number;
  lineTotalMinor: number;
}

export interface BuyerSellerOrder {
  id: string;
  sellerId: string;
  storeName: string;
  status: SellerOrderStatus;
  subtotalMinor: number;
  refundedMinor: number;
  cancelReason: string | null;
  items: OrderItem[];
}

export interface Order {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalMinor: number;
  refundedMinor: number;
  sellerOrders: BuyerSellerOrder[];
  createdAt: string;
}

export interface Refund {
  id: string;
  orderItemId: string;
  quantity: number;
  amountMinor: number;
  commissionReversalMinor: number;
  reason: string | null;
  createdAt: string;
}

export interface SellerOrder {
  id: string;
  orderId: string;
  status: SellerOrderStatus;
  paymentStatus: PaymentStatus;
  subtotalMinor: number;
  commissionRateBps: number;
  commissionMinor: number;
  refundedMinor: number;
  payoutMinor: number;
  cancelReason: string | null;
  items: OrderItem[];
  refunds: Refund[];
  createdAt: string;
  updatedAt: string;
}

export interface AuctionView {
  auctionId: string;
  productId: string;
  title: string;
  status: AuctionStatus;
  startPriceMinor: number;
  bidStepMinor: number;
  currentPriceMinor: number | null;
  minNextBidMinor: number;
  bidCount: number;
  leader: string | null;
  startsAt: string;
  endsAt: string;
  checkoutDeadline: string | null;
  recentBids: { amountMinor: number; bidder: string; createdAt: string }[];
  serverTime: string;
}

export interface BidResult {
  auctionId: string;
  productId: string;
  amountMinor: number;
  bidCount: number;
  minNextBidMinor: number;
  endsAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  createdAt: string;
}

export interface ReviewsPage extends Page<Review> {
  ratingAvg: number;
  ratingCount: number;
}

export interface Dispute {
  id: string;
  sellerOrderId: string;
  orderId: string;
  status: DisputeStatus;
  reason: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Notification {
  id: string;
  type: string;
  payload: Record<string, string | null>;
  readAt: string | null;
  createdAt: string;
}

export interface SellerApplication {
  id: string;
  userId: string;
  storeName: string;
  description: string | null;
  status: ApplicationStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface MoneyTotals {
  grossMinor: number;
  refundedMinor: number;
  commissionMinor: number;
  payoutMinor: number;
}

export interface AnalyticsSummary {
  period: { from: string; to: string };
  platformCommissionMinor: number;
  grossSalesMinor: number;
  refundedMinor: number;
  ordersCount: number;
  sellers: ({ sellerId: string; storeName: string } & MoneyTotals)[];
  topProducts: {
    productId: string;
    title: string;
    storeName: string;
    unitsSold: number;
    netMinor: number;
  }[];
  topSellers: { sellerId: string; storeName: string; ordersCount: number; netMinor: number }[];
  conversion: { cartUsers: number; buyers: number; ratePercent: number };
}

export interface SalesDay {
  day: string;
  grossMinor: number;
  refundedMinor: number;
  ordersCount: number;
}

export interface SalesChart {
  current: SalesDay[];
  previous: SalesDay[];
  totals: { currentNetMinor: number; previousNetMinor: number; changePercent: number | null };
}

export interface SellerDashboard {
  revenue: { last30Days: MoneyTotals; allTime: MoneyTotals };
  payouts: { pendingMinor: number; paidOutMinor: number };
  sellerOrders: Partial<Record<SellerOrderStatus, number>>;
  auctions: {
    productId: string;
    title: string;
    status: AuctionStatus;
    currentPriceMinor: number | null;
    minNextBidMinor: number;
    bidCount: number;
    endsAt: string;
    checkoutDeadline: string | null;
  }[];
  recentOrders: {
    id: string;
    orderId: string;
    status: SellerOrderStatus;
    subtotalMinor: number;
    createdAt: string;
  }[];
}

export interface Payout {
  id: string;
  sellerId: string;
  storeName: string;
  amountMinor: number;
  entriesSettled: number;
  providerRef: string;
  createdAt: string;
}

export interface SellerPayouts extends Page<Payout> {
  pendingMinor: number;
  paidOutMinor: number;
}
