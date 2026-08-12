import { Module } from '@nestjs/common';
import { OAuthModule } from '../oauth/oauth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [OAuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
