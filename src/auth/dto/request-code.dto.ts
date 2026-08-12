import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RequestCodeDto {
  @ApiProperty({
    example: '+79991234567',
    description: 'Phone number in E.164-ish format',
  })
  @IsString()
  phone: string;
}
