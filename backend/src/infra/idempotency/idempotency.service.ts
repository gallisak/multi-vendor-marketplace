import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import type { IdempotencyScope } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotentRequest {
  userId: string;
  scope: IdempotencyScope;
  key: string;
  payload: unknown;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export const REPLAYED_HEADER = 'Idempotent-Replayed';

export function sendIdempotent<T>(
  result: IdempotentResult<T>,
  res: { status(code: number): unknown; setHeader(name: string, value: string): unknown },
): T {
  res.status(result.status);
  if (result.replayed) {
    res.setHeader(REPLAYED_HEADER, 'true');
  }
  return result.body;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function requestHash(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    request: IdempotentRequest,
    work: (tx: Prisma.TransactionClient) => Promise<{ status: number; body: T }>,
  ): Promise<IdempotentResult<T>> {
    const hash = requestHash(request.payload);
    const where = {
      userId_scope_key: { userId: request.userId, scope: request.scope, key: request.key },
    };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.idempotencyKey.create({
            data: {
              userId: request.userId,
              scope: request.scope,
              key: request.key,
              requestHash: hash,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          });
          const result = await work(tx);
          await tx.idempotencyKey.update({
            where,
            data: {
              responseStatus: result.status,
              responseBody: result.body as Prisma.InputJsonValue,
            },
          });
          return { ...result, replayed: false };
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.prisma.idempotencyKey.findUnique({ where });
      if (!existing) {
        throw error;
      }
      if (existing.requestHash !== hash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request',
        );
      }
      return {
        status: existing.responseStatus!,
        body: existing.responseBody as T,
        replayed: true,
      };
    }
  }
}
