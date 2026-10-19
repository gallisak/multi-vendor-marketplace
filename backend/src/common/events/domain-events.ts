export type ProductChangeReason =
  'created' | 'updated' | 'stock_changed' | 'archived' | 'approved' | 'rejected';

export interface DomainEventPayloads {
  'product.changed': { productId: string; reason: ProductChangeReason };
  'category.changed': { categoryId: string };
  'seller.approved': { sellerId: string; userId: string; storeName: string };
}

export type DomainEventType = keyof DomainEventPayloads;

export interface NewDomainEvent<T extends DomainEventType = DomainEventType> {
  type: T;
  aggregateType: string;
  aggregateId: string;
  payload: DomainEventPayloads[T];
}

export interface PublishedEvent<
  T extends DomainEventType = DomainEventType,
> extends NewDomainEvent<T> {
  id: string;
  correlationId: string | null;
  occurredAt: string;
}

export const productChanged = (
  productId: string,
  reason: ProductChangeReason,
): NewDomainEvent<'product.changed'> => ({
  type: 'product.changed',
  aggregateType: 'product',
  aggregateId: productId,
  payload: { productId, reason },
});

export const categoryChanged = (categoryId: string): NewDomainEvent<'category.changed'> => ({
  type: 'category.changed',
  aggregateType: 'category',
  aggregateId: categoryId,
  payload: { categoryId },
});

export const sellerApproved = (
  payload: DomainEventPayloads['seller.approved'],
): NewDomainEvent<'seller.approved'> => ({
  type: 'seller.approved',
  aggregateType: 'seller',
  aggregateId: payload.sellerId,
  payload,
});
