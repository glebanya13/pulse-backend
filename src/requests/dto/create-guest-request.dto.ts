import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GuestRequestType, PriceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGuestRequestDto {
  @ApiProperty({
    enum: GuestRequestType,
    description:
      'GENERAL = open to any host, PERSONAL = addressed to a specific host',
  })
  @IsEnum(GuestRequestType)
  type: GuestRequestType;

  @ApiProperty({ example: 'Ищу компанию на ужин' })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiPropertyOptional({
    example: 'Приехал в город, хочу познакомиться и вкусно поесть',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 100,
    description: 'e.g. "нужно приготовить 100 порций еды для бригады"',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  portionsCount?: number;

  @ApiProperty({ enum: PriceType })
  @IsEnum(PriceType)
  budgetType: PriceType;

  @ApiPropertyOptional({
    description: 'Amount in RUB, used when budgetType = FIXED',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetAmount?: number;

  @ApiProperty({ example: '2026-07-15T18:00:00.000Z' })
  @IsDateString()
  requestedAt: string;

  @ApiPropertyOptional({
    example: '2026-07-15T21:00:00.000Z',
    description: 'End of desired window (must be >= requestedAt)',
  })
  @IsOptional()
  @IsDateString()
  requestedEndAt?: string;

  @ApiPropertyOptional({ description: 'Required when type = PERSONAL' })
  @IsOptional()
  @IsUUID()
  targetHostId?: string;

  @ApiPropertyOptional({ example: 'Москва, ул. Тверская, 12' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ type: [String], example: ['/uploads/xyz.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}
