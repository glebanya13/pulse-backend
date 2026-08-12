import {
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from '../auth/auth.service';
import { AppleTokenService } from './apple-token.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseIdTokenDto } from './dto/firebase-id-token.dto';

/**
 * Google / Apple login via Firebase Auth on the client.
 *
 * Flow:
 *  1. App signs in with Google or Apple through Firebase Auth.
 *  2. App sends the resulting ID token here (and Apple authorization code).
 *  3. We verify it with firebase-admin, map to googleId/appleId, and
 *     find-or-create the User row in our Postgres.
 *  4. We return our own JWT pair — Firebase is never the session authority
 *     after this point.
 */
@ApiTags('auth')
@Controller('auth/firebase')
export class FirebaseAuthController {
  constructor(
    private firebase: FirebaseAdminService,
    private authService: AuthService,
    private appleTokens: AppleTokenService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'Exchange a Firebase ID token (Google/Apple) for Pulse JWTs',
  })
  async exchange(@Body() dto: FirebaseIdTokenDto) {
    if (!this.firebase.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google/Apple login is not configured on this server',
      );
    }

    let decoded: Awaited<ReturnType<FirebaseAdminService['verifyIdToken']>>;
    try {
      decoded = await this.firebase.verifyIdToken(dto.idToken);
    } catch {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const provider = decoded.firebase?.sign_in_provider;
    if (provider !== 'google.com' && provider !== 'apple.com') {
      throw new UnauthorizedException(
        `Unsupported Firebase sign-in provider: ${provider ?? 'unknown'}`,
      );
    }

    const field = provider === 'google.com' ? 'googleId' : 'appleId';
    const identities = decoded.firebase?.identities ?? {};
    const providerIds = identities[provider] as string[] | undefined;
    const providerId = providerIds?.[0] ?? decoded.uid;

    let appleRefreshToken: string | null = null;
    if (provider === 'apple.com' && dto.appleAuthorizationCode) {
      appleRefreshToken = await this.appleTokens.exchangeAuthorizationCode(
        dto.appleAuthorizationCode,
      );
    }

    const { user, tokens } = await this.authService.loginOrRegisterByOAuthId(
      field,
      providerId,
      decoded.phone_number ?? null,
      {
        name: dto.name ?? decoded.name ?? null,
        avatarUrl: decoded.picture ?? null,
        firebaseUid: decoded.uid,
        appleRefreshToken,
      },
    );

    return { ...tokens, user };
  }
}
