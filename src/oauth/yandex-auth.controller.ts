import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { OAuthSessionService } from './oauth-session.service';
import { oauthResultPage } from './oauth-result-page';

/**
 * "Войти через Яндекс" — standard OAuth2 authorization-code flow against
 * Яндекс ID (https://yandex.ru/dev/id/doc/ru/). The app never sees the
 * client secret or exchanges the code itself: it opens `authorizeUrl` in a
 * browser, Yandex redirects straight to our server's callback below, and
 * the app just polls status/:sessionId (same shape as Telegram login) until
 * tokens show up.
 *
 * Register the app at https://oauth.yandex.ru/client/new with redirect URI
 * `<API base>/api/v1/auth/yandex/callback` and set YANDEX_CLIENT_ID /
 * YANDEX_CLIENT_SECRET / OAUTH_REDIRECT_BASE_URL — until those are set this
 * returns 503, same as Telegram login without a bot token.
 */
@ApiTags('auth')
@Controller('auth/yandex')
export class YandexAuthController {
  constructor(
    private config: ConfigService,
    private sessions: OAuthSessionService,
  ) {}

  private get clientId() {
    return this.config.get<string>('YANDEX_CLIENT_ID');
  }

  private get clientSecret() {
    return this.config.get<string>('YANDEX_CLIENT_SECRET');
  }

  private get redirectUri() {
    const base = this.config.get<string>('OAUTH_REDIRECT_BASE_URL');
    return base ? `${base}/api/v1/auth/yandex/callback` : undefined;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('start')
  @ApiOperation({
    summary: 'Start "Войти через Яндекс"',
    description:
      'Creates a pending login session and returns the Yandex authorize URL to open in a browser. ' +
      'Poll GET status/:sessionId afterwards to pick up the issued tokens.',
  })
  async start() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ServiceUnavailableException(
        'Yandex login is not configured on this server',
      );
    }

    const session = await this.sessions.start('YANDEX');
    const url = new URL('https://oauth.yandex.ru/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', session.id);
    url.searchParams.set('force_confirm', 'yes');

    return {
      sessionId: session.id,
      authorizeUrl: url.toString(),
      expiresAt: session.expiresAt,
    };
  }

  @Public()
  @Get('status/:sessionId')
  @ApiOperation({ summary: 'Poll a Yandex login session for completion' })
  async status(@Param('sessionId') sessionId: string) {
    return this.sessions.status(sessionId);
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: 'Yandex OAuth redirect target (not called by the app directly)',
  })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') sessionId: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (!sessionId) {
      res
        .status(400)
        .send(oauthResultPage(false, 'Некорректная ссылка входа.'));
      return;
    }

    if (error || !code) {
      await this.sessions.fail(sessionId);
      res.send(
        oauthResultPage(
          false,
          'Вход отменён. Вернитесь в приложение «Пульс».',
        ),
      );
      return;
    }

    try {
      const tokenRes = await fetch('https://oauth.yandex.ru/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
        }),
      });
      if (!tokenRes.ok)
        throw new Error(`token exchange failed: ${tokenRes.status}`);
      const { access_token: accessToken } = (await tokenRes.json()) as {
        access_token: string;
      };

      const profileRes = await fetch(
        'https://login.yandex.ru/info?format=json',
        {
          headers: { Authorization: `OAuth ${accessToken}` },
        },
      );
      if (!profileRes.ok)
        throw new Error(`profile fetch failed: ${profileRes.status}`);
      const profile = (await profileRes.json()) as {
        id: string;
        default_phone?: { number: string };
      };

      await this.sessions.complete(
        sessionId,
        'yandexId',
        profile.id,
        profile.default_phone?.number ?? null,
      );
      res.send(
        oauthResultPage(
          true,
          'Готово! Возвращайтесь в приложение «Пульс» — вы уже вошли.',
        ),
      );
    } catch {
      await this.sessions.fail(sessionId);
      res
        .status(502)
        .send(
          oauthResultPage(
            false,
            'Не удалось войти через Яндекс. Попробуйте ещё раз.',
          ),
        );
    }
  }
}
