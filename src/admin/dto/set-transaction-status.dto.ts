import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SetTransactionStatusDto {
  @ApiProperty({ enum: ['SUCCESS', 'FAILED'] })
  @IsIn(['SUCCESS', 'FAILED'])
  status: 'SUCCESS' | 'FAILED';
}
