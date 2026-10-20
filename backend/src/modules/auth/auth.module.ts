import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AccessTokenRevocationService } from './access-token-revocation.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google/google-auth.service.js';
import { GOOGLE_TOKEN_CLIENT, HttpGoogleTokenClient } from './google/google-token.client.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    { provide: GOOGLE_TOKEN_CLIENT, useClass: HttpGoogleTokenClient },
    TokenService,
    RefreshTokensRepository,
    AccessTokenRevocationService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, AccessTokenRevocationService],
})
export class AuthModule {}
