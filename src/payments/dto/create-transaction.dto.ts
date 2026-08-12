import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateTransactionDto {
  @ApiPropertyOptional({
    description: 'Which saved payment method to (pretend to) charge',
  })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}
