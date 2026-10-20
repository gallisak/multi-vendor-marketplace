import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { startOfUtcDay } from '../analytics/analytics.rules.js';
import { lineTotal } from '../orders/pricing.js';
import type { CartDto, CartLineDto, CartSellerGroupDto } from './cart.dto.js';
import { CartRepository } from './cart.repository.js';
import { unavailableReason } from './cart.rules.js';

@Injectable()
export class CartService {
  constructor(private readonly cart: CartRepository) {}

  async view(userId: string): Promise<CartDto> {
    const items = await this.cart.findItems(userId);

    const groups = new Map<string, CartSellerGroupDto>();
    for (const item of items) {
      const { product } = item;
      const reason = unavailableReason(product, item.quantity, userId);
      const line: CartLineDto = {
        productId: product.id,
        title: product.title,
        imageUrl: product.imageUrls[0] ?? null,
        unitPriceMinor: product.priceMinor,
        quantity: item.quantity,
        lineTotalMinor: Number(
          lineTotal({ unitPriceMinor: product.priceMinor, quantity: item.quantity }),
        ),
        stock: product.stock,
        available: reason === null,
        unavailableReason: reason,
      };
      const group = groups.get(product.seller.id) ?? {
        sellerId: product.seller.id,
        storeName: product.seller.storeName,
        items: [],
        subtotalMinor: 0,
      };
      group.items.push(line);
      if (line.available) {
        group.subtotalMinor += line.lineTotalMinor;
      }
      groups.set(product.seller.id, group);
    }

    const sellers = [...groups.values()];
    return {
      sellers,
      totalMinor: sellers.reduce((sum, group) => sum + group.subtotalMinor, 0),
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
      hasUnavailableItems: sellers.some((group) => group.items.some((line) => !line.available)),
    };
  }

  async setItem(userId: string, productId: string, quantity: number): Promise<CartDto> {
    const product = await this.cart.findProduct(productId);
    const reason = product ? unavailableReason(product, quantity, userId) : 'NOT_ACTIVE';

    switch (reason) {
      case null:
        break;
      case 'ARCHIVED':
      case 'NOT_ACTIVE':
      case 'SELLER_INACTIVE':
        throw new NotFoundException('Product not found');
      case 'AUCTION':
        throw new BadRequestException('Auction lots are bought by winning the auction');
      case 'OWN_PRODUCT':
        throw new BadRequestException('You cannot buy your own product');
      case 'OUT_OF_STOCK':
        throw new ConflictException('Product is out of stock');
      case 'INSUFFICIENT_STOCK':
        throw new ConflictException(`Only ${product!.stock} left in stock`);
    }

    await this.cart.setItem(userId, productId, quantity);
    await this.cart.recordActivity(userId, startOfUtcDay(new Date()));
    return this.view(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartDto> {
    await this.cart.removeItem(userId, productId);
    return this.view(userId);
  }

  async clear(userId: string) {
    await this.cart.clear(userId);
  }
}
