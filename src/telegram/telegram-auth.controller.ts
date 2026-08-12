import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramStartDto } from './dto/telegram-start.dto';

const SESSION_TTL_MS = 10 * 60 * 1000;

@ApiTags('auth')
@Controller('auth/telegram')
export class TelegramAuthController {
  constructor(
    private prisma: PrismaService,
    private bot: TelegramBotService,
  ) {}

  @Public()
  @Post('start')
  @ApiOperation({
    summary: 'Start "log in with Telegram" for a phone number',
    description:
      'Creates a pending login session and returns a t.me deep link. Opening it lets the user ' +
      'confirm the phone by sharing their Telegram contact with the bot — poll GET status/:sessionId ' +
      'afterwards to pick up the issued tokens.',
  })
  async start(@Body() dto: TelegramStartDto) {
    if (!this.bot.isEnabled || !this.bot.username) {
      throw new ServiceUnavailableException(
        'Telegram login is not configured on this server',
      );
    }

    const session = await this.prisma.telegramLoginSession.create({
      data: {
        phone: dto.phone,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return {
      sessionId: session.id,
      deepLink: `https://t.me/${this.bot.username}?start=${session.id}`,
      expiresAt: session.expiresAt,
    };
  }

  @Public()
  @Get('status/:sessionId')
  @ApiOperation({ summary: 'Poll a Telegram login session for completion' })
  async status(@Param('sessionId') sessionId: string) {
    const session = await this.prisma.telegramLoginSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new BadRequestException('Unknown session');
    }

    if (session.status === 'PENDING' && session.expiresAt < new Date()) {
      await this.prisma.telegramLoginSession.update({
        where: { id: sessionId },
        data: { status: 'EXPIRED' },
      });
      return { status: 'EXPIRED' as const };
    }

    if (session.status !== 'VERIFIED') {
      return { status: session.status };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId! },
      include: { badges: { include: { badge: true } } },
    });

    return {
      status: 'VERIFIED' as const,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user,
    };
  }
}
