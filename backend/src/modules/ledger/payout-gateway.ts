import { Injectable } from '@nestjs/common';

export const PAYOUT_GATEWAY = Symbol('PAYOUT_GATEWAY');

export interface TransferRequest {
  idempotencyKey: string;
  sellerId: string;
  amountMinor: bigint;
}

export interface PayoutGateway {
  transfer(request: TransferRequest): Promise<{ providerRef: string }>;
}

@Injectable()
export class MockPayoutGateway implements PayoutGateway {
  transfer(request: TransferRequest) {
    return Promise.resolve({ providerRef: `mock_transfer_${request.idempotencyKey}` });
  }
}
