import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendAttachmentDto {
  @ApiPropertyOptional({
    description: 'Optional caption under the photo/file',
    example: 'Вот полка с вином',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string;
}
