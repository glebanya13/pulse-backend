import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SendVoiceDto {
  @ApiPropertyOptional({
    description: 'Voice duration in milliseconds (from the recorder)',
    example: 4500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(180_000)
  durationMs?: number;
}
