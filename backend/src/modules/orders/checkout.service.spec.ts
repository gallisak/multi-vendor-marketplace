import type { ConfigService } from '@nestjs/config';
import type { Counter } from 'prom-client';
import { ProductStatus, ProductType } from '../../generated/prisma/enums.js';
import type { Env } from '../../infra/config/env.schema.js';
import type { IdempotencyService } from '../../infra/idempotency/idempotency.service.js';
import type { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Transaction } from '../../infra/prisma/unit-of-work.js';
import type { AuctionsRepository } from '../auctions/auctions.repository.js';
import type { CartRepository } from '../cart/cart.repository.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import { CheckoutRejected, CheckoutService } from './checkout.service.js';
import type { InventoryRepository, ReservedProduct } from './inventory.repository.js';
import type { OrdersRepository } from './orders.repository.js';
import type { OrderDraft } from './pricing.js';

const BUYER = 'buyer';
const TX = { tx: true } as unknown as Transaction;

interface Stock {
  sellerId: string;
  title: string;
  priceMinor: number;
  stock: number;
}

const cartItem = (productId: string, stock: Stock, quantity: number) => ({
  id: `item-${productId}`,
  productId,
  quantity,
  product: {
    id: productId,
    title: stock.title,
    priceMinor: stock.priceMinor,
    stock: stock.stock,
    status: ProductStatus.ACTIVE,
    type: ProductType.FIXED_PRICE,
    imageUrls: [],
    seller: { id: stock.sellerId, storeName: stock.sellerId, isActive: true, userId: 'seller' },
  },
});

function setup(
  warehouse: Record<string, Stock>,
  cart: [string, number][],
  beforeReserve: (productId: string) => void = () => undefined,
) {
  const reservations: [string, number][] = [];
  const inventory = {
    reserve: vi.fn((productId: string, quantity: number) => {
      beforeReserve(productId);
      reservations.push([productId, quantity]);
      const product = warehouse[productId];
      if (!product || product.stock < quantity) {
        return Promise.resolve(undefined);
      }
      product.stock -= quantity;
      return Promise.resolve<ReservedProduct>({ id: productId, ...product });
    }),
  };
  const orders = {
    create: vi.fn((buyerId: string, draft: OrderDraft) =>
      Promise.resolve({
        id: 'order-1',
        buyerId,
        status: 'NEW',
        paymentStatus: 'PENDING',
        totalMinor: draft.totalMinor,
        refundedMinor: 0n,
        commissionMinor: draft.commissionMinor,
        createdAt: new Date(),
        sellerOrders: draft.sellerOrders.map((sellerOrder, index) => ({
          id: `so-${index}`,
          sellerId: sellerOrder.sellerId,
          status: 'NEW',
          subtotalMinor: sellerOrder.subtotalMinor,
          commissionMinor: sellerOrder.commissionMinor,
          refundedMinor: 0n,
          cancelReason: null,
          seller: { storeName: sellerOrder.sellerId },
          disputes: [],
          items: sellerOrder.lines.map((line) => ({
            id: `oi-${line.productId}`,
            productId: line.productId,
            titleSnapshot: line.title,
            unitPriceMinor: line.unitPriceMinor,
            quantity: line.quantity,
            refundedQuantity: 0,
          })),
        })),
      }),
    ),
  };
  const cartRepository = {
    lockCart: vi.fn(() => Promise.resolve()),
    findItemsForCheckout: vi.fn(() =>
      Promise.resolve(
        cart.map(([productId, quantity]) => cartItem(productId, warehouse[productId], quantity)),
      ),
    ),
    removeItems: vi.fn(() => Promise.resolve()),
  };
  const ledger = { recordSales: vi.fn(() => Promise.resolve()) };
  const outbox = { add: vi.fn(() => Promise.resolve()) };
  const idempotency = {
    run: async (_request: unknown, work: (tx: Transaction) => Promise<{ body: unknown }>) => ({
      ...(await work(TX)),
      replayed: false,
    }),
  };
  const counter = { inc: vi.fn() } as unknown as Counter<string>;
  const config = { get: () => 10 } as unknown as ConfigService<Env, true>;

  const service = new CheckoutService(
    idempotency as unknown as IdempotencyService,
    orders as unknown as OrdersRepository,
    inventory as unknown as InventoryRepository,
    cartRepository as unknown as CartRepository,
    {} as AuctionsRepository,
    ledger as unknown as LedgerService,
    outbox as unknown as OutboxService,
    config,
    counter,
    counter,
  );
  return { service, reservations, orders, cartRepository, ledger, outbox };
}

const warehouse = () => ({
  a1: { sellerId: 'seller-a', title: 'Lamp', priceMinor: 10_000, stock: 5 },
  a2: { sellerId: 'seller-a', title: 'Bulb', priceMinor: 500, stock: 10 },
  b1: { sellerId: 'seller-b', title: 'Chair', priceMinor: 30_000, stock: 1 },
});

describe('CheckoutService stock write-off', () => {
  it('writes off every line of every seller in one transaction and splits the order', async () => {
    const stock = warehouse();
    const { service, reservations, orders, cartRepository, ledger, outbox } = setup(stock, [
      ['a1', 2],
      ['a2', 4],
      ['b1', 1],
    ]);

    const result = await service.checkout(BUYER, 'key', {});

    expect(reservations).toEqual([
      ['a1', 2],
      ['a2', 4],
      ['b1', 1],
    ]);
    expect([stock.a1.stock, stock.a2.stock, stock.b1.stock]).toEqual([3, 6, 0]);
    const draft = orders.create.mock.calls[0][1];
    expect(
      draft.sellerOrders.map((so) => [so.sellerId, so.subtotalMinor, so.commissionMinor]),
    ).toEqual([
      ['seller-a', 22_000n, 2_200n],
      ['seller-b', 30_000n, 3_000n],
    ]);
    expect(result.body.totalMinor).toBe(52_000);
    expect(ledger.recordSales).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ sellerId: 'seller-b' })]),
      TX,
    );
    expect(cartRepository.removeItems).toHaveBeenCalledWith(['item-a1', 'item-a2', 'item-b1'], TX);
    const events = outbox.add.mock.calls[0].slice(1) as { type: string }[];
    expect(events.map((event) => event.type)).toEqual([
      'order.placed',
      'product.changed',
      'product.changed',
      'product.changed',
    ]);
  });

  it('aborts the whole checkout when another buyer takes the last unit first', async () => {
    const stock = warehouse();
    const { service, reservations, orders, cartRepository, ledger } = setup(
      stock,
      [
        ['a1', 1],
        ['b1', 1],
      ],
      (productId) => {
        if (productId === 'b1') stock.b1.stock = 0;
      },
    );

    await expect(service.checkout(BUYER, 'key', {})).rejects.toMatchObject({
      reason: 'stock_conflict',
    });
    expect(reservations).toEqual([
      ['a1', 1],
      ['b1', 1],
    ]);
    expect(orders.create).not.toHaveBeenCalled();
    expect(ledger.recordSales).not.toHaveBeenCalled();
    expect(cartRepository.removeItems).not.toHaveBeenCalled();
  });

  it('rejects unavailable items before touching any stock', async () => {
    const stock = warehouse();
    stock.b1.stock = 0;
    const { service, reservations } = setup(stock, [
      ['a1', 1],
      ['b1', 1],
    ]);

    await expect(service.checkout(BUYER, 'key', {})).rejects.toBeInstanceOf(CheckoutRejected);
    expect(reservations).toEqual([]);
  });

  it('rejects the order when the total no longer matches what the buyer saw', async () => {
    const { service, orders } = setup(warehouse(), [['a1', 1]]);

    await expect(
      service.checkout(BUYER, 'key', { expectedTotalMinor: 9_999 }),
    ).rejects.toMatchObject({ reason: 'price_changed' });
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('refuses an empty cart', async () => {
    const { service } = setup(warehouse(), []);

    await expect(service.checkout(BUYER, 'key', {})).rejects.toThrow('Cart is empty');
  });
});
