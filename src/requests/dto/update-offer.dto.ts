import { ApiProperty } from '@nestjs/swagger';
import { RequestOfferStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateOfferDto {
  @ApiProperty({
    enum: [RequestOfferStatus.ACCEPTED, RequestOfferStatus.DECLINED],
  })
  @IsEnum(RequestOfferStatus)
  status: RequestOfferStatus;
}
