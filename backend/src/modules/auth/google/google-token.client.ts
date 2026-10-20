import { Injectable } from '@nestjs/common';
import { GOOGLE_TOKEN_URL, GoogleSignInError } from './google-oauth.rules.js';

export const GOOGLE_TOKEN_CLIENT = Symbol('GOOGLE_TOKEN_CLIENT');

export interface CodeExchange {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface GoogleTokenClient {
  exchangeCode(exchange: CodeExchange): Promise<string>;
}

@Injectable()
export class HttpGoogleTokenClient implements GoogleTokenClient {
  async exchangeCode(exchange: CodeExchange): Promise<string> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: exchange.code,
        code_verifier: exchange.codeVerifier,
        client_id: exchange.clientId,
        client_secret: exchange.clientSecret,
        redirect_uri: exchange.callbackUrl,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id_token?: string;
      error?: string;
    };
    if (!response.ok || typeof body.id_token !== 'string') {
      throw new GoogleSignInError(
        'oauth_failed',
        `Google token exchange failed: ${body.error ?? response.status}`,
      );
    }
    return body.id_token;
  }
}
