import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const VALID_KEY = /^[\w-]{8,128}$/;

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !VALID_KEY.test(value)) {
    throw new BadRequestException(
      'Idempotency-Key header is required: 8-128 characters of letters, digits, "-" or "_"',
    );
  }
  return value;
}

export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  parseIdempotencyKey(ctx.switchToHttp().getRequest<Request>().headers[IDEMPOTENCY_HEADER]),
);
