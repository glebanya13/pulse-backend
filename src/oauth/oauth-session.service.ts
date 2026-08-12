import { BadRequestException, Injectable } from '@nestjs/common';
import { OAuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

const SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * Shared "start a session, poll for completion" bookkeeping for the
 * Yandex/VK OAuth logins — the same shape as TelegramLoginSession, just
 * generalized over `provider` since the session lifecycle (PENDING ->
 * VERIFIED/EXPIRED, tokens stashed on the row for the app to pick up) is
 * identical for both.
 */
@Injectable()
export class OAuthSessionService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async start(provider: OAuthProvider) {
    return this.prisma.oAuthLoginSession.create({
      data: { provider, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }

  async get(sessionId: string) {
    const session = await this.prisma.oAuthLoginSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new BadRequestException('Unknown session');
    }
    return session;
  }

  async status(sessionId: string) {
    const session = await this.get(sessionId);

    if (session.status === 'PENDING' && session.expiresAt < new Date()) {
      await this.prisma.oAuthLoginSession.update({
        where: { id: sessionId },
        data: { status: 'EXPIRED' },
      });
      return { status: 'EXPIRED' as const };
    }

    if (session.status !== 'VERIFIED') {
      return { status: session.status };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId! },
      include: { badges: { include: { badge: true } } },
    });

    return {
      status: 'VERIFIED' as const,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user,
    };
  }

  /** Called from the provider's callback once the identity is verified. */
  async complete(
    sessionId: string,
    field: 'yandexId' | 'vkId' | 'googleId' | 'appleId',
    providerId: string,
    phone?: string | null,
  ) {
    const { user, tokens } = await this.authService.loginOrRegisterByOAuthId(
      field,
      providerId,
      phone,
    );
    await this.prisma.oAuthLoginSession.update({
      where: { id: sessionId },
      data: {
        status: 'VERIFIED',
        userId: user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  }

  async fail(sessionId: string) {
    await this.prisma.oAuthLoginSession.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' },
    });
  }
}
