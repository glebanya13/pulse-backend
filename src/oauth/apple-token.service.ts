import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/**
 * Sign in with Apple token exchange + revoke (App Store 5.1.1(v)).
 * No-ops when APPLE_CLIENT_ID / TEAM_ID / KEY_ID / PRIVATE_KEY are unset —
 * account deletion must still succeed without them.
 */
@Injectable()
export class AppleTokenService {
  private readonly logger = new Logger(AppleTokenService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('APPLE_CLIENT_ID')?.trim() &&
        this.config.get<string>('APPLE_TEAM_ID')?.trim() &&
        this.config.get<string>('APPLE_KEY_ID')?.trim() &&
        this.privateKey(),
    );
  }

  private privateKey(): string | null {
    const raw =
      this.config.get<string>('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n')?.trim() ||
      null;
    return raw;
  }

  private clientSecret(): string | null {
    if (!this.isConfigured()) return null;
    const clientId = this.config.get<string>('APPLE_CLIENT_ID')!.trim();
    const teamId = this.config.get<string>('APPLE_TEAM_ID')!.trim();
    const keyId = this.config.get<string>('APPLE_KEY_ID')!.trim();
    const key = this.privateKey()!;
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: teamId,
        iat: now,
        exp: now + 60 * 60 * 24 * 180,
        aud: 'https://appleid.apple.com',
        sub: clientId,
      },
      key,
      { algorithm: 'ES256', keyid: keyId },
    );
  }

  /** Exchange Apple authorization code → refresh_token (store for later revoke). */
  async exchangeAuthorizationCode(code: string): Promise<string | null> {
    const secret = this.clientSecret();
    const clientId = this.config.get<string>('APPLE_CLIENT_ID')?.trim();
    if (!secret || !clientId) {
      this.logger.warn(
        'Apple token exchange skipped — set APPLE_CLIENT_ID / TEAM_ID / KEY_ID / PRIVATE_KEY',
      );
      return null;
    }
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        code,
        grant_type: 'authorization_code',
      });
      const res = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data = (await res.json()) as {
        refresh_token?: string;
        error?: string;
      };
      if (!res.ok || !data.refresh_token) {
        this.logger.warn(
          `Apple token exchange failed: ${data.error ?? res.status}`,
        );
        return null;
      }
      return data.refresh_token;
    } catch (err) {
      this.logger.warn(`Apple token exchange error: ${err}`);
      return null;
    }
  }

  /** Best-effort revoke; never throws (deletion must proceed). */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const secret = this.clientSecret();
    const clientId = this.config.get<string>('APPLE_CLIENT_ID')?.trim();
    if (!secret || !clientId) {
      this.logger.warn('Apple revoke skipped — Apple Sign In keys not configured');
      return;
    }
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      const res = await fetch('https://appleid.apple.com/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        this.logger.warn(`Apple revoke returned ${res.status}`);
      } else {
        this.logger.log('Apple refresh token revoked');
      }
    } catch (err) {
      this.logger.warn(`Apple revoke error: ${err}`);
    }
  }
}
