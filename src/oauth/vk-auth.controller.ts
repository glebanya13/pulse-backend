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

const VK_API_VERSION = '5.131';

/**
 * "Войти через VK" — same shape as the Yandex flow (see
 * yandex-auth.controller.ts), against VK's OAuth2 endpoints
 * (https://dev.vk.com/ru/api/access-token/authcode-flow-user). Register the
 * app at https://vk.com/apps?act=manage with redirect URI
 * `<API base>/api/v1/auth/vk/callback` and set VK_CLIENT_ID / VK_CLIENT_SECRET
 * / OAUTH_REDIRECT_BASE_URL — until those are set this returns 503, same as
 * Telegram/Yandex login without credentials.
 *
 * Note: VK has been migrating apps to a newer "VK ID" flow (id.vk.com) with
 * slightly different endpoints/PKCE requirements. If the registered app is
 * VK ID-only, the authorize/token URLs below will need updating to match —
 * this implements the classic oauth.vk.com server-side flow, which is what
 * VK's docs describe for apps that still use it.
 */
@ApiTags('auth')
@Controller('auth/vk')
export class VkAuthController {
  constructor(
    private config: ConfigService,
    private sessions: OAuthSessionService,
  ) {}

  private get clientId() {
    return this.config.get<string>('VK_CLIENT_ID');
  }

  private get clientSecret() {
    return this.config.get<string>('VK_CLIENT_SECRET');
  }

  private get redirectUri() {
    const base = this.config.get<string>('OAUTH_REDIRECT_BASE_URL');
    return base ? `${base}/api/v1/auth/vk/callback` : undefined;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('start')
  @ApiOperation({
    summary: 'Start "Войти через VK"',
    description:
      'Creates a pending login session and returns the VK authorize URL to open in a browser. ' +
      'Poll GET status/:sessionId afterwards to pick up the issued tokens.',
  })
  async start() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ServiceUnavailableException(
        'VK login is not configured on this server',
      );
    }

    const session = await this.sessions.start('VK');
    const url = new URL('https://oauth.vk.com/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'phone');
    url.searchParams.set('state', session.id);
    url.searchParams.set('v', VK_API_VERSION);

    return {
      sessionId: session.id,
      authorizeUrl: url.toString(),
      expiresAt: session.expiresAt,
    };
  }

  @Public()
  @Get('status/:sessionId')
  @ApiOperation({ summary: 'Poll a VK login session for completion' })
  async status(@Param('sessionId') sessionId: string) {
    return this.sessions.status(sessionId);
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: 'VK OAuth redirect target (not called by the app directly)',
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
      const tokenUrl = new URL('https://oauth.vk.com/access_token');
      tokenUrl.searchParams.set('client_id', this.clientId!);
      tokenUrl.searchParams.set('client_secret', this.clientSecret!);
      tokenUrl.searchParams.set('redirect_uri', this.redirectUri!);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString());
      if (!tokenRes.ok)
        throw new Error(`token exchange failed: ${tokenRes.status}`);
      const tokenData = (await tokenRes.json()) as {
        user_id: number;
        phone?: string;
      };

      await this.sessions.complete(
        sessionId,
        'vkId',
        String(tokenData.user_id),
        tokenData.phone ?? null,
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
            'Не удалось войти через VK. Попробуйте ещё раз.',
          ),
        );
    }
  }
}
