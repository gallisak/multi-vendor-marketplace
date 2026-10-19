import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Seller } from '../../generated/prisma/client.js';
import type { SellerProfileDto } from './sellers.dto.js';
import { SellersRepository } from './sellers.repository.js';

@Injectable()
export class SellersService {
  constructor(private readonly sellers: SellersRepository) {}

  async requireActiveSellerId(userId: string): Promise<string> {
    const seller = await this.sellers.findStatusByUserId(userId);
    if (!seller?.isActive) {
      throw new ForbiddenException('Active seller profile required');
    }
    return seller.id;
  }

  async getPublicProfile(id: string): Promise<SellerProfileDto> {
    const seller = await this.sellers.findActive(id);
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }
    return SellersService.toProfile(seller);
  }

  static toProfile(seller: Seller): SellerProfileDto {
    return {
      id: seller.id,
      storeName: seller.storeName,
      description: seller.description,
      ratingAvg: seller.ratingAvg.toNumber(),
      ratingCount: seller.ratingCount,
      createdAt: seller.createdAt,
    };
  }
}
