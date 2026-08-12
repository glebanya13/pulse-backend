import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SetAuthorOfMonthDto {
  @ApiProperty({ description: 'User id to crown as author of the month' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Calendar month YYYY-MM (defaults to current UTC month)',
    example: '2026-08',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  period?: string;

  @ApiPropertyOptional({ description: 'Short internal note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
