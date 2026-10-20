import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto, toPage, toSkipTake } from '../../common/pagination.js';
import { toOrderDto } from './order.mapper.js';
import type { OrderDto } from './orders.dto.js';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

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
}
