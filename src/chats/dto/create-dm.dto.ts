import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDmDto {
  @ApiProperty({ description: 'User id to open a private chat with' })
  @IsUUID()
  userId!: string;
}
