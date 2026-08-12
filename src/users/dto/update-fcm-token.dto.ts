import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateFcmTokenDto {
  @ApiPropertyOptional({
    description: 'FCM device token. Omit or null to clear.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(512)
  token?: string | null;
}
