import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TelegramStartDto {
  @ApiPropertyOptional({
    example: '+79991234567',
    description:
      'Phone number in E.164-ish format. If provided, the shared Telegram contact must match it ' +
      '(used when the user already typed a phone on the login screen). If omitted, whatever phone ' +
      'the Telegram contact provides is used as-is (one-tap "Continue with Telegram").',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
