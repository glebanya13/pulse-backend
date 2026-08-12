import { ApiProperty } from '@nestjs/swagger';
import { ComplaintStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateComplaintDto {
  @ApiProperty({ enum: [ComplaintStatus.RESOLVED, ComplaintStatus.DISMISSED] })
  @IsEnum(ComplaintStatus)
  status: ComplaintStatus;
}
