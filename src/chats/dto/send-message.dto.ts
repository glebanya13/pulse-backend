import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Привет! Во сколько лучше подъехать?' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}
