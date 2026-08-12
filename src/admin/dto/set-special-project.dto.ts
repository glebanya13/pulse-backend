import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetSpecialProjectDto {
  @ApiProperty({ description: 'Invite / revoke special-project flag' })
  @IsBoolean()
  enabled!: boolean;
}
