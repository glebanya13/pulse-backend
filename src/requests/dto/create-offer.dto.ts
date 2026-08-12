import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOfferDto {
  @ApiPropertyOptional({
    example: 'Могу приготовить, есть опыт с большими компаниями',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
