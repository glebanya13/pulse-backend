import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SimulateTransactionDto {
  @ApiProperty({ enum: ['SUCCESS', 'FAILED'] })
  @IsIn(['SUCCESS', 'FAILED'])
  status: 'SUCCESS' | 'FAILED';
}
