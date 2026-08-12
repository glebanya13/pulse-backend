import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeletePhotoDto {
  @ApiProperty({
    description: 'Exact photo URL as stored on User.photos / User.avatarUrl',
  })
  @IsString()
  url: string;
}
