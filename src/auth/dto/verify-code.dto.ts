import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyCodeDto {
  @ApiProperty({ example: '+79991234567' })
  @IsString()
  phone: string;

  @ApiProperty({
    example: '0000',
    description:
      'When AUTH_DEV_CODE is set, that value (e.g. "0000") is accepted for any phone.',
  })
  @IsString()
  @Length(4, 6)
  code: string;
}
