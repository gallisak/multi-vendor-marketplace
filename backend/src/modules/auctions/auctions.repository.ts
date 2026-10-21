import { Injectable } from '@nestjs/common';
import { AuctionStatus, ProductStatus } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export interface LotForCheckout {
  id: string;
  status: AuctionStatus;
  winnerId: string | null;
  currentPriceMinor: number | null;
  windowOpen: boolean;
}

const LOT_OWNER = {
  product: { select: { title: true, status: true, seller: { select: { userId: true } } } },
} as const;

@Injectable()
export class AuctionsRepository extends PrismaRepository {
  async now(tx?: Transaction) {
    const [{ now }] = await this.db(tx).$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    return now;
  }

  findForBidding(productId: string, tx: Transaction) {
    return tx.auction.findUnique({
      where: { productId },
      include: { product: { select: { status: true, seller: { select: { userId: true } } } } },
    });
  }

  async applyBid(
    bid: { auctionId: string; version: number; bidderId: string; amountMinor: number },
    tx: Transaction,
  ) {
    const [updated] = await tx.$queryRaw<{ bidCount: number; endsAt: Date }[]>`
      UPDATE auctions
      SET current_price_minor = ${bid.amountMinor},
          leader_id = ${bid.bidderId}::uuid,
          bid_count = bid_count + 1,
          version = version + 1,
          updated_at = now()
      WHERE id = ${bid.auctionId}::uuid
        AND version = ${bid.version}
        AND status = 'ACTIVE'
        AND ends_at > now()
      RETURNING bid_count AS "bidCount", ends_at AS "endsAt"`;
    return updated;
  }

  async recordBid(
    bid: { auctionId: string; productId: string; bidderId: string; amountMinor: number },
    tx: Transaction,
  ) {
    await tx.bid.create({
      data: { auctionId: bid.auctionId, bidderId: bid.bidderId, amountMinor: bid.amountMinor },
    });
    await tx.product.update({
      where: { id: bid.productId },
      data: { priceMinor: bid.amountMinor, version: { increment: 1 } },
    });
  }

  findView(productId: string) {
    return this.prisma.auction.findUnique({
      where: { productId },
      include: {
        product: { select: { title: true, status: true, seller: { select: { userId: true } } } },
        leader: { select: { name: true } },
      },
    });
  }

  recentBids(auctionId: string, since: Date, take: number) {
    return this.prisma.bid.findMany({
      where: { auctionId, createdAt: { gte: since } },
      orderBy: { amountMinor: 'desc' },
      take,
      include: { bidder: { select: { name: true } } },
    });
  }

  async dueToClose(take: number) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions
      WHERE status = 'ACTIVE' AND ends_at <= now()
      ORDER BY ends_at
      LIMIT ${take}`;
    return rows.map((row) => row.id);
  }

  async dueToRelist(take: number) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions
      WHERE status = 'AWAITING_CHECKOUT' AND checkout_deadline <= now()
      ORDER BY checkout_deadline
      LIMIT ${take}`;
    return rows.map((row) => row.id);
  }

  async lockDueToClose(auctionId: string, tx: Transaction) {
    const [locked] = await tx.$queryRaw<{ now: Date }[]>`
      SELECT now() AS now FROM auctions
      WHERE id = ${auctionId}::uuid AND status = 'ACTIVE' AND ends_at <= now()
      FOR UPDATE SKIP LOCKED`;
    return locked?.now ?? null;
  }

  async lockDueToRelist(auctionId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions
      WHERE id = ${auctionId}::uuid AND status = 'AWAITING_CHECKOUT' AND checkout_deadline <= now()
      FOR UPDATE SKIP LOCKED`;
    return rows.length > 0;
  }

  findWithOwner(auctionId: string, tx: Transaction) {
    return tx.auction.findUniqueOrThrow({ where: { id: auctionId }, include: LOT_OWNER });
  }

  async markWon(auctionId: string, winnerId: string, checkoutDeadline: Date, tx: Transaction) {
    await tx.auction.update({
      where: { id: auctionId },
      data: {
        status: AuctionStatus.AWAITING_CHECKOUT,
        winnerId,
        checkoutDeadline,
        version: { increment: 1 },
      },
    });
  }

  async setStatus(auctionId: string, status: AuctionStatus, tx: Transaction) {
    await tx.auction.update({
      where: { id: auctionId },
      data: { status, version: { increment: 1 } },
    });
  }

  async markLotSoldOut(productId: string, tx: Transaction) {
    await tx.product.update({
      where: { id: productId },
      data: { status: ProductStatus.SOLD_OUT, version: { increment: 1 } },
    });
  }

  async relist(
    lot: { auctionId: string; productId: string; startPriceMinor: number },
    window: { startsAt: Date; endsAt: Date },
    tx: Transaction,
  ) {
    await tx.auction.update({
      where: { id: lot.auctionId },
      data: {
        status: AuctionStatus.ACTIVE,
        currentPriceMinor: null,
        leaderId: null,
        winnerId: null,
        bidCount: 0,
        checkoutDeadline: null,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        version: { increment: 1 },
      },
    });
    await tx.product.update({
      where: { id: lot.productId },
      data: {
        status: ProductStatus.ACTIVE,
        priceMinor: lot.startPriceMinor,
        stock: 1,
        version: { increment: 1 },
      },
    });
  }

  async lockForCheckout(productId: string, tx: Transaction) {
    const [lot] = await tx.$queryRaw<LotForCheckout[]>`
      SELECT id, status, winner_id AS "winnerId", current_price_minor AS "currentPriceMinor",
             checkout_deadline > now() AS "windowOpen"
      FROM auctions
      WHERE product_id = ${productId}::uuid
      FOR UPDATE`;
    return lot;
  }

  findSoldLots(productIds: string[], tx: Transaction) {
    return tx.auction.findMany({
      where: {
        productId: { in: productIds },
        status: AuctionStatus.SOLD,
        product: { status: ProductStatus.SOLD_OUT },
      },
      select: { id: true, productId: true },
    });
  }
}
