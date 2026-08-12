import { ApiPropertyOptional } from '@nestjs/swagger';
import { EventFormat, PriceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

function toStringArray(value: unknown): string[] | undefined {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export class QueryEventsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Bounding box south-west latitude, for map viewport queries',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  minLat?: number;

  @ApiPropertyOptional({ description: 'Bounding box south-west longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  minLng?: number;

  @ApiPropertyOptional({ description: 'Bounding box north-east latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  maxLat?: number;

  @ApiPropertyOptional({ description: 'Bounding box north-east longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  maxLng?: number;

  @ApiPropertyOptional({ description: 'Center latitude, alternative to bbox' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Center longitude, alternative to bbox' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    description: 'Radius in km, used together with lat+lng',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusKm?: number;

  @ApiPropertyOptional({ enum: EventFormat })
  @IsOptional()
  @IsEnum(EventFormat)
  format?: EventFormat;

  @ApiPropertyOptional({
    description: 'Legacy single tag filter (prefer `tags`)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated or repeated tags — match any (OR)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ enum: PriceType })
  @IsOptional()
  @IsEnum(PriceType)
  priceType?: PriceType;

  @ApiPropertyOptional({
    description: 'Free-text search across title/description/address',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Only events whose host rating is >= this value (0–100)',
    example: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minHostRating?: number;

  @ApiPropertyOptional({
    description:
      'Only events hosted by users the current viewer follows (Подписки)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  followingOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Only events from talent hosts (authorLevel ≥ 5 — Домашний шеф+)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  talentsOnly?: boolean;

  @ApiPropertyOptional({
    description: 'City catalog slug (GET /cities), e.g. minsk / moscow',
    example: 'minsk',
  })
  @IsOptional()
  @IsString()
  city?: string;
}
