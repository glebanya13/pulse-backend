import { ApiProperty } from '@nestjs/swagger';
import { ComplaintTargetType } from '@prisma/client';
import {
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateComplaintDto {
  @ApiProperty({ enum: ComplaintTargetType })
  @IsEnum(ComplaintTargetType)
  targetType: ComplaintTargetType;

  @ApiProperty({ description: 'Id of the reported user or event' })
  @IsUUID()
  targetId: string;

  @ApiProperty({
    example: 'Хозяин не пустил на мероприятие, хотя заявка была принята',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
