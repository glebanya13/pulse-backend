import { ApiPropertyOptional } from '@nestjs/swagger';
import { GuestRequestStatus, GuestRequestType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: GuestRequestType })
  @IsOptional()
  @IsEnum(GuestRequestType)
  type?: GuestRequestType;

  @ApiPropertyOptional({ enum: GuestRequestStatus })
  @IsOptional()
  @IsEnum(GuestRequestStatus)
  status?: GuestRequestStatus;
}
