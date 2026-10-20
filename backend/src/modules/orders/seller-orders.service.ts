import { Injectable, NotFoundException } from '@nestjs/common';
import { toPage, toSkipTake } from '../../common/pagination.js';
import { SellerOrderStatus } from '../../generated/prisma/enums.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { SellersService } from '../sellers/sellers.service.js';
import { assertPaid } from './refund-rules.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';
import { toSellerOrderDto } from './order.mapper.js';
import type { SellerOrderDto, SellerOrdersQueryDto } from './orders.dto.js';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class SellerOrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly uow: UnitOfWork,
    private readonly sellers: SellersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async list(userId: string, query: SellerOrdersQueryDto) {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    const [sellerOrders, total] = await this.orders.findSellerOrderPage(
      sellerId,
      query.status,
      toSkipTake(query),
    );
    return toPage(sellerOrders.map(toSellerOrderDto), total, query);
  }

  async get(userId: string, sellerOrderId: string): Promise<SellerOrderDto> {
    return toSellerOrderDto(await this.findOwned(userId, sellerOrderId));
  }

  async accept(userId: string, sellerOrderId: string): Promise<SellerOrderDto> {
    const sellerOrder = await this.findOwned(userId, sellerOrderId);
    assertPaid(sellerOrder.order.paymentStatus);
    return this.moveTo(userId, sellerOrderId, SellerOrderStatus.PROCESSING);
  }

  async ship(userId: string, sellerOrderId: string): Promise<SellerOrderDto> {
    await this.findOwned(userId, sellerOrderId);
    return this.moveTo(userId, sellerOrderId, SellerOrderStatus.SHIPPED);
  }

  async cancel(userId: string, sellerOrderId: string, reason: string): Promise<SellerOrderDto> {
    const sellerOrder = await this.findOwned(userId, sellerOrderId);
    assertPaid(sellerOrder.order.paymentStatus);
    await this.uow.run((tx) => this.lifecycle.cancel(tx, sellerOrderId, reason));
    return this.get(userId, sellerOrderId);
  }

  private async moveTo(userId: string, sellerOrderId: string, to: SellerOrderStatus) {
    await this.uow.run((tx) => this.lifecycle.transition(tx, sellerOrderId, to));
    return this.get(userId, sellerOrderId);
  }

  private async findOwned(userId: string, sellerOrderId: string) {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    const sellerOrder = await this.orders.findOwnedSellerOrder(sellerOrderId, sellerId);
    if (!sellerOrder) {
      throw new NotFoundException('Seller order not found');
    }
    return sellerOrder;
  }
}
