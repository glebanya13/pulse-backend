import { ApiPropertyOptional } from '@nestjs/swagger';
import { PickupMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApplicationDto {
  @ApiPropertyOptional({
    example: 'Привет! Очень хочу попасть на ваш ужин, обожаю пасту :)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    enum: PickupMethod,
    description:
      'Guest\'s pickup choice for a takeaway order ("Заберу сам" / "Мне нужна доставка"). Only relevant when ordering a takeaway dish.',
  })
  @IsOptional()
  @IsEnum(PickupMethod)
  pickupMethod?: PickupMethod;
}
