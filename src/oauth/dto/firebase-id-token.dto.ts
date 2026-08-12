import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class FirebaseIdTokenDto {
  @ApiProperty({
    description:
      'Firebase Auth ID token from the Flutter client after Google/Apple sign-in',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    description:
      "Full name from the IdP's native SDK response. Apple only returns " +
      'the name out-of-band on the very first authorization (never inside ' +
      "the ID token itself), so the client must forward it here — it can't " +
      'be recovered from decoded.name on the backend for Apple sign-ins.',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Apple authorization code from Sign in with Apple (iOS). Exchanged ' +
      'server-side for a refresh token so we can revoke it on account deletion.',
  })
  @IsOptional()
  @IsString()
  appleAuthorizationCode?: string;
}
