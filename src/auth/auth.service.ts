import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SmsPilotService } from './sms-pilot.service';

const CODE_TTL_MS = 5 * 60 * 1000;

/**
 * bcrypt truncates its input at 72 bytes — fine for passwords, silently
 * wrong for JWTs. A refresh token's header + `sub` + `phone` claims alone
 * already exceed 72 bytes, so two different tokens for the same user (which
 * only differ in `jti`/`iat`/`exp`/signature — all past that cutoff) hash to
 * the SAME bcrypt digest and compare equal, defeating rotation/revocation
 * entirely. Refresh tokens are already high-entropy random-looking secrets
 * (unlike passwords), so a fast, deterministic SHA-256 digest — compared by
 * an indexed equality lookup instead of a bcrypt.compare loop — is both
 * correct and simpler.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private smsPilot: SmsPilotService,
  ) {}

  private get isDev() {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  /**
   * Fixed SMS code from AUTH_DEV_CODE (e.g. "0000" for App Review).
   * When set, that code is issued and accepted in every environment —
   * including production. Clear the env var to return to random codes only.
   */
  private get authDevCode(): string | undefined {
    const raw = this.config.get<string>('AUTH_DEV_CODE')?.trim();
    return raw || undefined;
  }

  /**
   * Request an SMS login code. When SMSPILOT_API_KEY is set, the code is sent
   * via smspilot.ru; otherwise (local/test) it is only logged / returned as
   * `devCode`. Production without an API key refuses to pretend the SMS was sent.
   * If AUTH_DEV_CODE is set, that fixed code is stored and sent instead of a random one.
   */
  async requestCode(dto: RequestCodeDto) {
    const fixed = this.authDevCode;
    const code = fixed ?? Math.floor(1000 + Math.random() * 9000).toString();
    await this.prisma.authCode.create({
      data: {
        phone: dto.phone,
        code,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    const message = `Код входа в «Пульс»: ${code}`;

    // Fixed review/dev code: do not depend on SMS delivery (Pilot often
    // rejects unknown numbers). App still shows the SMS screen; user enters
    // AUTH_DEV_CODE.
    if (fixed) {
      // eslint-disable-next-line no-console
      console.log(
        `[auth] Fixed AUTH_DEV_CODE for ${dto.phone}: ${code} — SMS skipped`,
      );
    } else if (this.smsPilot.isConfigured()) {
      await this.smsPilot.send(dto.phone, message);
    } else if (!this.isDev) {
      throw new ServiceUnavailableException(
        'SMS provider is not configured on this server',
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[auth] SMS code for ${dto.phone}: ${code} — SMSPILOT_API_KEY unset, SMS not sent`,
      );
    }

    return { sent: true, ...(this.isDev ? { devCode: code } : {}) };
  }

  async verifyCode(dto: VerifyCodeDto) {
    const devCode = this.authDevCode;
    let valid = Boolean(devCode) && dto.code === devCode;

    if (!valid) {
      const record = await this.prisma.authCode.findFirst({
        where: {
          phone: dto.phone,
          code: dto.code,
          consumed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (record) {
        valid = true;
        await this.prisma.authCode.update({
          where: { id: record.id },
          data: { consumed: true },
        });
      }
    }

    if (!valid) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    const { user, tokens } = await this.loginOrRegisterByPhone(dto.phone);
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { badges: { include: { badge: true } } },
    });
    return { ...tokens, user: fullUser };
  }

  /**
   * Shared "find or create the user, mark their phone verified, issue
   * tokens" step. Used by the SMS-code verify flow above and by the
   * Telegram-contact login flow (see TelegramBotService), which verifies
   * phone ownership via a shared Telegram contact instead of a typed code.
   */
  async loginOrRegisterByPhone(phone: string, name?: string | null) {
    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, phoneVerified: true, name: name ?? undefined },
      });
    } else {
      const patch: { phoneVerified?: boolean; name?: string } = {};
      if (!user.phoneVerified) patch.phoneVerified = true;
      if (!user.name && name) patch.name = name;
      if (Object.keys(patch).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: patch,
        });
      }
    }

    return { user, tokens: await this.issueTokens(user.id, user.phone) };
  }

  /**
   * Find-or-create for OAuth / Firebase IdP logins (Yandex, VK, Google, Apple)
   * that identify a user by a stable provider id rather than a phone code.
   * Mirrors loginOrRegisterByPhone: match by provider id first, then by phone
   * if the IdP handed one back, so linking doesn't duplicate an existing
   * phone/Telegram account. Providers often omit phone, so accounts created
   * here without one get a synthetic `provider:id` placeholder in the
   * (required, unique) phone column — treated as an internal key only.
   *
   * Profile fields (name / avatar) from the IdP are applied on first create
   * and only fill empty fields on an existing account — we never overwrite
   * a user-edited profile with Google/Apple metadata, and we never store
   * the Firebase/Google profile as the source of truth (Postgres on our
   * RF VPS is).
   */
  async loginOrRegisterByOAuthId(
    field: 'yandexId' | 'vkId' | 'googleId' | 'appleId',
    providerId: string,
    phone?: string | null,
    profile?: {
      name?: string | null;
      avatarUrl?: string | null;
      firebaseUid?: string | null;
      appleRefreshToken?: string | null;
    },
  ) {
    const placeholderPrefix: Record<typeof field, string> = {
      yandexId: 'yandex',
      vkId: 'vk',
      googleId: 'google',
      appleId: 'apple',
    };

    let user = await this.prisma.user.findFirst({
      where: { [field]: providerId },
    });

    if (!user && phone) {
      user = await this.prisma.user.findUnique({ where: { phone } });
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          [field]: providerId,
          phone: phone ?? `${placeholderPrefix[field]}:${providerId}`,
          phoneVerified: Boolean(phone),
          name: profile?.name ?? undefined,
          avatarUrl: profile?.avatarUrl ?? undefined,
          firebaseUid: profile?.firebaseUid ?? undefined,
          appleRefreshToken: profile?.appleRefreshToken ?? undefined,
        },
      });
    } else {
      const patch: {
        yandexId?: string;
        vkId?: string;
        googleId?: string;
        appleId?: string;
        name?: string;
        avatarUrl?: string;
        firebaseUid?: string;
        appleRefreshToken?: string;
      } = {};
      if (!user[field]) patch[field] = providerId;
      if (!user.name && profile?.name) patch.name = profile.name;
      if (!user.avatarUrl && profile?.avatarUrl)
        patch.avatarUrl = profile.avatarUrl;
      if (!user.firebaseUid && profile?.firebaseUid)
        patch.firebaseUid = profile.firebaseUid;
      if (profile?.appleRefreshToken)
        patch.appleRefreshToken = profile.appleRefreshToken;
      if (Object.keys(patch).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: patch,
        });
      }
    }

    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { badges: { include: { badge: true } } },
    });
    return {
      user: fullUser!,
      tokens: await this.issueTokens(user.id, user.phone),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; phone: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matched = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        revoked: false,
        expiresAt: { gt: new Date() },
        tokenHash: hashToken(dto.refreshToken),
      },
    });

    if (!matched) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { revoked: true },
    });

    return this.issueTokens(payload.sub, payload.phone);
  }

  /** Revokes the presented refresh token (and any siblings for that user). */
  async logout(dto: RefreshTokenDto) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // Already invalid/expired — treat as logged out.
      return { success: true };
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        userId: payload.sub,
        revoked: false,
        OR: [
          { tokenHash: hashToken(dto.refreshToken) },
          { expiresAt: { gt: new Date() } },
        ],
      },
      data: { revoked: true },
    });

    return { success: true };
  }

  private async issueTokens(userId: string, phone: string) {
    const payload = { sub: userId, phone };
    // Two tokens minted for the same user in the same wall-clock second
    // (`iat` has only second granularity) would otherwise be byte-identical
    // JWTs — which broke refresh-token rotation: presenting the just-revoked
    // token would still match the newly-issued row via bcrypt.compare since
    // the plaintext was the same string. `jti` guarantees every issued token
    // is distinct regardless of timing.
    const accessToken = await this.jwt.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        // @nestjs/jwt 11's expiresIn type is `ms`'s branded StringValue, which
        // a plain env-var string can't statically narrow to — the value is a
        // well-formed duration string ("15m"/"30d") at runtime regardless.
        expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as any,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_TTL') ?? '30d') as any,
      },
    );

    const tokenHash = hashToken(refreshToken);
    const ttlDays =
      parseInt(
        (this.config.get<string>('JWT_REFRESH_TTL') ?? '30d').replace(
          /\D/g,
          '',
        ),
      ) || 30;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
