import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-code')
  @ApiOperation({
    summary: 'Request an SMS verification code (SMS Pilot)',
    description:
      'Generates a 4-digit code, stores it for 5 minutes, and sends it via smspilot.ru when SMSPILOT_API_KEY is set. ' +
      'In non-production without a key, the code is logged and returned as devCode. ' +
      'When AUTH_DEV_CODE is set (any environment), that fixed code is issued and accepted. ' +
      'Rate-limited to 5 requests/minute per IP.',
  })
  requestCode(@Body() dto: RequestCodeDto) {
    return this.authService.requestCode(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-code')
  @ApiOperation({
    summary:
      'Verify SMS code and obtain access/refresh JWTs (creates the user on first login). ' +
      'Rate-limited to 10 attempts/minute per IP to slow down code brute-forcing.',
  })
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary:
      'Exchange a refresh token for a new access/refresh token pair (rotates the refresh token)',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @ApiOperation({
    summary: 'Revoke the refresh token (and sibling sessions for that user)',
  })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }
}
