import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export const CART_PRODUCT_SELECT = {
  id: true,
  title: true,
  priceMinor: true,
  stock: true,
  status: true,
  type: true,
  imageUrls: true,
  seller: { select: { id: true, storeName: true, isActive: true, userId: true } },
} as const;

@Injectable()
export class CartRepository extends PrismaRepository {
  findItems(userId: string) {
    return this.prisma.cartItem.findMany({
      where: { cart: { userId } },
      include: { product: { select: CART_PRODUCT_SELECT } },
      orderBy: { addedAt: 'asc' },
    });
  }

  findItemsForCheckout(userId: string, tx: Transaction) {
    return tx.cartItem.findMany({
      where: { cart: { userId } },
      include: { product: { select: CART_PRODUCT_SELECT } },
      orderBy: { productId: 'asc' },
    });
  }

  findProduct(productId: string) {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: CART_PRODUCT_SELECT,
    });
  }

  async setItem(userId: string, productId: string, quantity: number) {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity },
    });
  }

  async removeItem(userId: string, productId: string) {
    await this.prisma.cartItem.deleteMany({ where: { productId, cart: { userId } } });
  }

  async clear(userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  }

  async removeItems(ids: string[], tx: Transaction) {
    await tx.cartItem.deleteMany({ where: { id: { in: ids } } });
  }
}
