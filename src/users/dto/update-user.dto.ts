import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SOCIAL_LINK_KEYS = [
  'instagram',
  'telegram',
  'vk',
  'facebook',
  'youtube',
  'tiktok',
  'ok',
] as const;

export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

/** Keep only known keys, trim, drop empties, cap length. */
export function sanitizeSocialLinks(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const key of SOCIAL_LINK_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, 200);
    if (trimmed.length > 0) out[key] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Мария' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 28 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(16)
  @Max(120)
  age?: number;

  @ApiPropertyOptional({ example: 'Москва' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description:
      'Either a local /uploads/... path or a full URL (e.g. once storage moves to S3)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: 'Люблю готовить для друзей и знакомиться с новыми людьми',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({
    example: 'Паста, выпечка, завтраки, десерты',
    description: 'Host-specific: what I cook',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  whatICook?: string;

  @ApiPropertyOptional({
    description:
      'Public social profile handles/URLs (instagram, telegram, vk, facebook, youtube, tiktok, ok)',
    example: { instagram: 'maria_cooks', telegram: '@maria' },
  })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
