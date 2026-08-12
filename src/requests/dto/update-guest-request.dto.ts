import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { GuestRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateGuestRequestDto } from './create-guest-request.dto';

export class UpdateGuestRequestDto extends PartialType(CreateGuestRequestDto) {
  @ApiPropertyOptional({ enum: GuestRequestStatus })
  @IsOptional()
  @IsEnum(GuestRequestStatus)
  status?: GuestRequestStatus;
}
