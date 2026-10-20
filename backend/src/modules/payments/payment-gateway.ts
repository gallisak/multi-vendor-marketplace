import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../infra/config/env.schema.js';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface ChargeRequest {
  idempotencyKey: string;
  amountMinor: bigint;
}

export type ChargeResult = { ok: true; providerRef: string } | { ok: false; reason: string };

export interface RefundRequest {
  idempotencyKey: string;
  providerRef: string | null;
  amountMinor: bigint;
}

export type RefundResult = { ok: true; providerRef: string } | { ok: false; reason: string };

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(request: RefundRequest): Promise<RefundResult>;
}

export function mockCharge(request: ChargeRequest, declineAboveMinor: bigint): ChargeResult {
  if (request.amountMinor > declineAboveMinor) {
    return { ok: false, reason: 'Card declined: amount exceeds the card limit' };
  }
  return { ok: true, providerRef: `mock_${request.idempotencyKey}` };
}

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly declineAboveMinor: bigint;

  constructor(config: ConfigService<Env, true>) {
    this.declineAboveMinor = BigInt(
      config.get('PAYMENT_MOCK_DECLINE_ABOVE_MINOR', { infer: true }),
    );
  }

  charge(request: ChargeRequest): Promise<ChargeResult> {
    return Promise.resolve(mockCharge(request, this.declineAboveMinor));
  }

  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({ ok: true, providerRef: `mock_refund_${request.idempotencyKey}` });
  }
}
