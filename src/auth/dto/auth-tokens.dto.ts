import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}

export class RequestCodeResponseDto {
  @ApiProperty({ example: true })
  sent: boolean;

  @ApiProperty({
    required: false,
    description:
      'Only present when NODE_ENV !== "production". Lets you test without a real SMS provider.',
    example: '4821',
  })
  devCode?: string;
}
