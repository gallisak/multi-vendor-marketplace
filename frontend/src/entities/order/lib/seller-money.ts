import type { SellerOrder } from '@/shared/api';

export const netCommission = (order: SellerOrder) =>
  order.subtotalMinor - order.refundedMinor - order.payoutMinor;
