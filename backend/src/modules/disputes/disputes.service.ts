import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { disputeOpened, disputeResolved } from '../../common/events/domain-events.js';
import { toPage, toSkipTake } from '../../common/pagination.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';
import { DisputeStatus, SellerOrderStatus } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { OrderLifecycleService } from '../orders/order-lifecycle.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { assertPaid, refundableQuantity } from '../orders/refund-rules.js';
import { RefundsService } from '../orders/refunds.service.js';
import { SellersService } from '../sellers/sellers.service.js';
import type {
  DisputeDecision,
  DisputeDto,
  DisputesQueryDto,
  ResolveDisputeDto,
} from './disputes.dto.js';
import { type DisputeRow, type DisputeScope, DisputesRepository } from './disputes.repository.js';

const DISPUTABLE: SellerOrderStatus[] = [SellerOrderStatus.SHIPPED, SellerOrderStatus.COMPLETED];

const toDto = ({ sellerOrder, ...dispute }: DisputeRow): DisputeDto => ({
  ...dispute,
  orderId: sellerOrder.orderId,
  storeName: sellerOrder.seller.storeName,
  sellerOrderStatus: sellerOrder.status,
  subtotalMinor: Number(sellerOrder.subtotalMinor),
  refundedMinor: Number(sellerOrder.refundedMinor),
});

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly disputes: DisputesRepository,
    private readonly orders: OrdersRepository,
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly refunds: RefundsService,
    private readonly sellers: SellersService,
  ) {}

  async open(buyerId: string, orderId: string, sellerOrderId: string, reason: string) {
    if (!(await this.orders.findBuyerSellerOrder(buyerId, orderId, sellerOrderId))) {
      throw new NotFoundException('Seller order not found');
    }

    try {
      return await this.uow.run(async (tx) => {
        await this.lifecycle.lockOrder(tx, orderId);
        const sellerOrder = await this.disputes.sellerOrderForDispute(sellerOrderId, tx);
        if (!DISPUTABLE.includes(sellerOrder.status)) {
          throw new ConflictException('A dispute can be opened only after the order was shipped');
        }
        assertPaid(sellerOrder.order.paymentStatus);
        if (sellerOrder.refundedMinor >= sellerOrder.subtotalMinor) {
          throw new ConflictException('Everything from this seller is already refunded');
        }
        if (sellerOrder.disputes.length > 0) {
          throw new ConflictException('A dispute about this seller order was already decided');
        }

        const dispute = await this.disputes.create(
          { sellerOrderId, openedById: buyerId, reason },
          tx,
        );
        await this.outbox.add(
          tx,
          disputeOpened({
            disputeId: dispute.id,
            sellerOrderId,
            orderId,
            buyerId,
            sellerUserId: sellerOrder.seller.userId,
          }),
        );
        this.logger.log({ disputeId: dispute.id, sellerOrderId }, 'Dispute opened');
        return toDto(dispute);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A dispute is already open for this seller order');
      }
      throw error;
    }
  }

  async withdraw(buyerId: string, disputeId: string): Promise<DisputeDto> {
    if (!(await this.disputes.withdraw(disputeId, buyerId))) {
      await this.findVisible(disputeId, buyerId);
      throw new ConflictException('The dispute is no longer open');
    }
    return this.findVisible(disputeId);
  }

  async resolve(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
    return this.uow.run(async (tx) => {
      const orderId = await this.disputes.orderIdOf(disputeId, tx);
      if (!orderId) {
        throw new NotFoundException('Dispute not found');
      }
      await this.lifecycle.lockOrder(tx, orderId);
      const sellerOrder = await this.disputes.sellerOrderOf(disputeId, tx);

      const resolved = await this.disputes.resolveOpen(
        disputeId,
        { status: statusFor(dto.decision), resolutionNote: dto.note, resolvedById: adminId },
        tx,
      );
      if (!resolved) {
        throw new ConflictException('The dispute is no longer open');
      }

      let refundedMinor = 0n;
      if (dto.decision === 'BUYER') {
        for (const item of sellerOrder.items) {
          const quantity = refundableQuantity(item);
          if (quantity > 0) {
            refundedMinor += await this.refunds.refundItem(tx, {
              sellerOrderId: sellerOrder.id,
              orderItemId: item.id,
              quantity,
              reason: `Dispute resolved for buyer: ${dto.note}`,
              restock: false,
              actorId: adminId,
            });
          }
        }
      }
      if (sellerOrder.status === SellerOrderStatus.SHIPPED) {
        await this.lifecycle.transition(tx, sellerOrder.id, SellerOrderStatus.COMPLETED);
      }

      await this.outbox.add(
        tx,
        disputeResolved({
          disputeId,
          sellerOrderId: sellerOrder.id,
          orderId: sellerOrder.orderId,
          buyerId: sellerOrder.order.buyerId,
          sellerUserId: sellerOrder.seller.userId,
          status: statusFor(dto.decision),
          refundedMinor: refundedMinor.toString(),
        }),
      );
      this.logger.log(
        { disputeId, adminId, decision: dto.decision, refundedMinor: refundedMinor.toString() },
        'Dispute resolved',
      );
      return toDto(await this.disputes.get(disputeId, tx));
    });
  }

  async listForBuyer(buyerId: string, query: DisputesQueryDto) {
    return this.list({ openedById: buyerId }, query);
  }

  async listForSeller(userId: string, query: DisputesQueryDto) {
    const sellerId = await this.sellers.requireActiveSellerId(userId);
    return this.list({ sellerId }, query);
  }

  async listAll(query: DisputesQueryDto) {
    return this.list({}, query);
  }

  private async list(scope: DisputeScope, query: DisputesQueryDto) {
    const [rows, total] = await this.disputes.findPage(
      { ...scope, status: query.status },
      toSkipTake(query),
    );
    return toPage(rows.map(toDto), total, query);
  }

  private async findVisible(disputeId: string, openedById?: string) {
    const dispute = await this.disputes.findVisible(disputeId, openedById);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    return toDto(dispute);
  }
}

function statusFor(decision: DisputeDecision): DisputeStatus {
  return decision === 'BUYER'
    ? DisputeStatus.RESOLVED_FOR_BUYER
    : DisputeStatus.RESOLVED_FOR_SELLER;
}
