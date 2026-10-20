import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto, toPage, toSkipTake } from '../../common/pagination.js';
import { SellerOrderStatus } from '../../generated/prisma/enums.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';
import { toOrderDto } from './order.mapper.js';
import type { OrderDto } from './orders.dto.js';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly uow: UnitOfWork,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async listForBuyer(buyerId: string, query: PaginationQueryDto) {
    const [orders, total] = await this.orders.findPageForBuyer(buyerId, toSkipTake(query));
    return toPage(orders.map(toOrderDto), total, query);
  }

  async getForBuyer(buyerId: string, orderId: string): Promise<OrderDto> {
    const order = await this.orders.findForBuyer(orderId, buyerId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderDto(order);
  }

  async confirmDelivery(buyerId: string, orderId: string, sellerOrderId: string) {
    const sellerOrder = await this.orders.findBuyerSellerOrder(buyerId, orderId, sellerOrderId);
    if (!sellerOrder) {
      throw new NotFoundException('Seller order not found');
    }
    await this.uow.run((tx) =>
      this.lifecycle.transition(tx, sellerOrderId, SellerOrderStatus.COMPLETED),
    );
    return this.getForBuyer(buyerId, orderId);
  }
}
