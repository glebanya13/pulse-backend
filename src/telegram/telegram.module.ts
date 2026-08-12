import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TelegramAuthController } from './telegram-auth.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [AuthModule],
  controllers: [TelegramAuthController],
  providers: [TelegramBotService],
})
export class TelegramModule {}
