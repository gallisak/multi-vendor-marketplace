import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../../common/auth/auth.types.js';
import { Role } from '../../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

const contextFor = (user?: AuthUser) =>
  ({
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardRequiring = (roles?: Role[]) => {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('allows any authenticated user when no roles are required', () => {
    expect(guardRequiring().canActivate(contextFor({ id: 'u1', role: Role.CUSTOMER }))).toBe(true);
  });

  it('allows a user with one of the required roles', () => {
    const guard = guardRequiring([Role.SELLER, Role.ADMIN]);

    expect(guard.canActivate(contextFor({ id: 'u1', role: Role.SELLER }))).toBe(true);
  });

  it('rejects a user without the required role', () => {
    const guard = guardRequiring([Role.ADMIN]);

    expect(() => guard.canActivate(contextFor({ id: 'u1', role: Role.SELLER }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user', () => {
    expect(() => guardRequiring([Role.ADMIN]).canActivate(contextFor())).toThrow(
      ForbiddenException,
    );
  });
});
