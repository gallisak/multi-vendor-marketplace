import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../infra/config/env.schema.js';
import { PublicUser } from '../users/user.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthProvidersDto, AuthResponseDto, LoginDto, RegisterDto } from './auth.dto.js';
import { AuthResult, AuthService } from './auth.service.js';
import type { AuthUser, IssuedTokens } from '../../common/auth/auth.types.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { GoogleAuthService } from './google/google-auth.service.js';
import { GoogleSignInError } from './google/google-oauth.rules.js';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';
export const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_PATH = '/api/auth/google';

const queryString = (value: unknown) => (typeof value === 'string' ? value : undefined);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleAuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('providers')
  @ApiOkResponse({ type: AuthProvidersDto })
  providers(): AuthProvidersDto {
    return { password: true, google: this.google.enabled };
  }

  @Public()
  @Get('google')
  @ApiFoundResponse({ description: 'Redirects to the Google consent screen' })
  async googleStart(@Res() res: Response) {
    if (!this.google.enabled) {
      return res.redirect(HttpStatus.FOUND, this.frontendUrl('/login', 'google_disabled'));
    }
    const { url, state } = await this.google.start();
    res.cookie(OAUTH_STATE_COOKIE, state, { ...this.stateCookieOptions(), maxAge: 600_000 });
    return res.redirect(HttpStatus.FOUND, url);
  }

  @Public()
  @Get('google/callback')
  @ApiFoundResponse({
    description:
      'Sets the refresh cookie and redirects to the frontend, which exchanges it for an access token',
  })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, this.stateCookieOptions());
    if (queryString(req.query.error)) {
      return res.redirect(HttpStatus.FOUND, this.frontendUrl('/login', 'oauth_cancelled'));
    }

    try {
      const result = await this.google.complete({
        state: queryString(req.query.state),
        code: queryString(req.query.code),
        cookieState,
      });
      this.setRefreshCookie(result.tokens, res);
      const target = new URL('/auth/callback', this.config.get('FRONTEND_URL', { infer: true }));
      if (result.linked) {
        target.searchParams.set('linked', 'google');
      }
      return res.redirect(HttpStatus.FOUND, target.toString());
    } catch (error) {
      const code = error instanceof GoogleSignInError ? error.code : 'oauth_failed';
      this.logger.warn({ err: error, code }, 'Google sign-in failed');
      return res.redirect(HttpStatus.FOUND, this.frontendUrl('/login', code));
    }
  }

  @Public()
  @Post('register')
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(await this.auth.register(dto), res);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiTooManyRequestsResponse({
    description: 'More than 5 attempts per minute for one email, or too many from one IP',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(await this.auth.login(dto), res);
  }

  @Public()
  @ApiCookieAuth(REFRESH_COOKIE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token is missing, expired, revoked or reused' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    try {
      return this.respond(await this.auth.refresh(token), res);
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Public()
  @ApiCookieAuth(REFRESH_COOKIE)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: PublicUser })
  async me(@CurrentUser() current: AuthUser): Promise<PublicUser> {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return UsersService.toPublic(user);
  }

  private respond({ user, tokens }: AuthResult, res: Response): AuthResponseDto {
    this.setRefreshCookie(tokens, res);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.accessTokenExpiresIn,
      user: UsersService.toPublic(user),
    };
  }

  private setRefreshCookie(tokens: IssuedTokens, res: Response) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      expires: tokens.refreshTokenExpiresAt,
    });
  }

  private frontendUrl(path: string, error: string) {
    const url = new URL(path, this.config.get('FRONTEND_URL', { infer: true }));
    url.searchParams.set('error', error);
    return url.toString();
  }

  private stateCookieOptions(): CookieOptions {
    return { ...this.cookieOptions(), path: OAUTH_STATE_COOKIE_PATH };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
