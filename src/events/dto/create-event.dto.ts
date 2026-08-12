import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EventFormat,
  GenderRequirement,
  PickupMethod,
  PriceType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ enum: EventFormat, description: '"в гостях" | "на вынос"' })
  @IsEnum(EventFormat)
  format: EventFormat;

  @ApiProperty({ example: 'Ужин с пастой и вином' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({
    example: 'Домашняя паста карбонара, бокал вина и хорошая компания',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Ужин', 'Алкоголь'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  tags?: string[];

  @ApiProperty({
    example: '2026-07-15T16:00:00.000Z',
    description: 'Start of the “waiting for guests” window',
  })
  @IsDateString()
  startAt: string;

  @ApiPropertyOptional({
    example: '2026-07-15T21:00:00.000Z',
    description:
      'End of the waiting window (must be >= startAt). Omit for a single point in time.',
  })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 'Москва, ул. Тверская, 12' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    example: 'minsk',
    description: 'City catalog slug (GET /cities). Defaults to minsk.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  citySlug?: string;

  @ApiPropertyOptional({
    example: 'Гараж',
    description: 'Venue name for Place upsert (defaults to address)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  placeName?: string;

  @ApiPropertyOptional({
    description: 'External map provider id for Place dedup',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  placeExternalId?: string;

  @ApiPropertyOptional({
    default: 1,
    description:
      'Minimum accepted guests before the host “starts” (cooking / confirming). Soft threshold — event is not auto-cancelled if unmet.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minGuests?: number;

  @ApiPropertyOptional({
    default: 1,
    description: 'Maximum seats / capacity',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxGuests?: number;

  @ApiProperty({ enum: PriceType })
  @IsEnum(PriceType)
  priceType: PriceType;

  @ApiPropertyOptional({
    description: 'Amount in RUB, required when priceType = FIXED',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceAmount?: number;

  @ApiPropertyOptional({
    enum: GenderRequirement,
    default: GenderRequirement.ANY,
  })
  @IsOptional()
  @IsEnum(GenderRequirement)
  requirementGender?: GenderRequirement;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  requirementMinAge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  requirementMaxAge?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirementInterests?: string[];

  @ApiPropertyOptional({
    enum: PickupMethod,
    description: 'Only relevant when format = TAKEAWAY',
  })
  @IsOptional()
  @IsEnum(PickupMethod)
  pickupMethod?: PickupMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @ApiPropertyOptional({
    description: 'Approximate weight of one portion, grams (takeaway only)',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  portionWeightGrams?: number;
}
