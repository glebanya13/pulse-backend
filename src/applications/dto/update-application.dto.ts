import { ApiProperty } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateApplicationDto {
  @ApiProperty({
    enum: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED],
  })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;
}
