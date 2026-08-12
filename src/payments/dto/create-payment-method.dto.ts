import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethodType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty({ enum: PaymentMethodType })
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  @ApiPropertyOptional({
    example: '**** 4242',
    description:
      'Display mask only — never a real card number. Only the last 4 digits are accepted.',
  })
  @IsOptional()
  @IsString()
  // Deliberately strict: rejects anything that looks like a real PAN so a
  // full card number can never make it into the database, even by mistake.
  @Matches(/^\*{4} \d{4}$/, {
    message: 'cardMask must look like "**** 4242" — never a full card number',
  })
  cardMask?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
