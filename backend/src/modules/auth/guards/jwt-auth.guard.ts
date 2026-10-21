import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import type { Env } from '../../../infra/config/env.schema.js';
import type { AccessTokenPayload, AuthUser } from '../../../common/auth/auth.types.js';
import { IS_PUBLIC_KEY } from '../../../common/auth/decorators.js';
import { AccessTokenRevocationService } from '../access-token-revocation.service.js';

export function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly cls: ClsService,
    private readonly revocation: AccessTokenRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractBearerToken(req.headers.authorization);

    if (isPublic) {
      if (token) {
        await this.authenticate(req, token).catch(() => undefined);
      }
      return true;
    }
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }
    await this.authenticate(req, token);
    return true;
  }

  private async authenticate(req: Request & { user?: AuthUser }, token: string) {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (await this.revocation.isRevoked(payload)) {
      throw new UnauthorizedException('Access token is outdated, refresh it');
    }

    req.user = { id: payload.sub, role: payload.role };
    this.cls.set('userId', payload.sub);
  }
}
