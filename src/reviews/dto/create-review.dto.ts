import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewTargetRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ReviewScoresDto } from './review-scores.dto';

export class CreateReviewDto {
  @ApiProperty({ description: 'Id of the user being reviewed' })
  @IsUUID()
  targetId: string;

  @ApiProperty({
    enum: ReviewTargetRole,
    description: 'Which category set applies to the scores below',
  })
  @IsEnum(ReviewTargetRole)
  targetRole: ReviewTargetRole;

  @ApiProperty({ type: ReviewScoresDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ReviewScoresDto)
  scores: ReviewScoresDto;

  @ApiPropertyOptional({ example: 'Отличный вечер, очень вкусно и уютно!' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
