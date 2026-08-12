import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot, { type Message } from 'node-telegram-bot-api';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { phoneDigitsMatch, toE164 } from './phone.util';

/**
 * "Log in with Telegram" flow, used as a stand-in for a real SMS provider:
 *
 * 1. App calls POST /auth/telegram/start with the phone it wants to verify,
 *    gets back a session id + a t.me deep link.
 * 2. App opens the deep link; Telegram opens our bot with /start <sessionId>.
 * 3. Bot asks the user to share their Telegram contact (native button — no
 *    typing). We check the shared contact's phone against the session's
 *    phone, and if they match, log the user in (create the account on
 *    first login) and stash the issued tokens on the session row.
 * 4. App polls GET /auth/telegram/status/:sessionId until it sees the
 *    tokens.
 *
 * Telegram's Bot API can't push a message to an arbitrary phone number —
 * the bot can only message chats that messaged it first — which is why this
 * needs the deep-link+contact-share dance instead of just "send an SMS".
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: TelegramBot | null = null;
  private botUsername: string | null = null;
  private readonly pendingSessionByChat = new Map<number, string>();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN not set — Telegram login is disabled.',
      );
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });

    try {
      const me = await this.bot.getMe();
      this.botUsername = me.username ?? null;
      this.logger.log(
        `Telegram bot @${this.botUsername} is polling for updates.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to initialize Telegram bot: ${(err as Error).message}`,
      );
      return;
    }

    this.bot.onText(/\/start(?:\s+(\S+))?/, (msg, match) => {
      void this.handleStart(msg.chat.id, match?.[1]);
    });

    this.bot.on('contact', (msg) => {
      const name = [msg.contact?.first_name, msg.contact?.last_name]
        .filter((p): p is string => !!p && p.trim().length > 0)
        .join(' ')
        .trim();
      void this.handleContact(
        msg.chat.id,
        msg.contact?.phone_number,
        name || undefined,
      );
    });

    // support.html links straight to this bot as the support contact, so any
    // free-text message that isn't a login command/contact-share must get a
    // reply instead of the bot going silent.
    this.bot.on('message', (msg) => {
      void this.handleGeneralMessage(msg);
    });

    this.bot.on('polling_error', (err) =>
      this.logger.error(`Telegram polling error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.bot?.stopPolling();
  }

  get isEnabled(): boolean {
    return this.bot !== null;
  }

  get username(): string | null {
    return this.botUsername;
  }

  private async handleStart(chatId: number, sessionId: string | undefined) {
    if (!this.bot) return;

    if (!sessionId) {
      await this.bot.sendMessage(
        chatId,
        'Откройте эту ссылку из приложения «Пульс», чтобы войти — тогда я буду знать, какой номер подтверждать.',
      );
      return;
    }

    const session = await this.prisma.telegramLoginSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !session ||
      session.status !== 'PENDING' ||
      session.expiresAt < new Date()
    ) {
      await this.bot.sendMessage(
        chatId,
        'Ссылка для входа устарела. Запросите новую в приложении.',
      );
      return;
    }

    this.pendingSessionByChat.set(chatId, sessionId);

    const greeting = session.phone
      ? `Здравствуйте! Чтобы войти в «Пульс» с номером ${session.phone}, поделитесь, пожалуйста, контактом кнопкой ниже.`
      : 'Здравствуйте! Чтобы войти в «Пульс», поделитесь, пожалуйста, контактом кнопкой ниже.';

    await this.bot.sendMessage(chatId, greeting, {
      reply_markup: {
        keyboard: [
          [{ text: 'Поделиться номером телефона', request_contact: true }],
        ],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  }

  private async handleContact(
    chatId: number,
    contactPhone: string | undefined,
    contactName?: string,
  ) {
    if (!this.bot || !contactPhone) return;

    const sessionId = this.pendingSessionByChat.get(chatId);
    if (!sessionId) {
      await this.bot.sendMessage(
        chatId,
        'Не нашёл сессию входа. Откройте ссылку из приложения ещё раз.',
      );
      return;
    }

    const session = await this.prisma.telegramLoginSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !session ||
      session.status !== 'PENDING' ||
      session.expiresAt < new Date()
    ) {
      await this.bot.sendMessage(
        chatId,
        'Ссылка для входа устарела. Запросите новую в приложении.',
      );
      this.pendingSessionByChat.delete(chatId);
      return;
    }

    if (session.phone && !phoneDigitsMatch(session.phone, contactPhone)) {
      await this.bot.sendMessage(
        chatId,
        'Номер из вашего Telegram-профиля не совпадает с номером, который вы ввели в приложении. Попробуйте снова.',
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    const phone = session.phone ?? toE164(contactPhone);
    const { user, tokens } = await this.authService.loginOrRegisterByPhone(
      phone,
      contactName,
    );

    await this.prisma.telegramLoginSession.update({
      where: { id: sessionId },
      data: {
        status: 'VERIFIED',
        chatId: String(chatId),
        userId: user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
    this.pendingSessionByChat.delete(chatId);

    await this.bot.sendMessage(
      chatId,
      'Готово! Возвращайтесь в приложение «Пульс» — вы уже вошли ✅',
      {
        reply_markup: { remove_keyboard: true },
      },
    );
  }

  /**
   * Support inbox: forwards any message that isn't the login flow (command
   * or contact-share) to TELEGRAM_SUPPORT_CHAT_ID so a human sees it, and
   * always acknowledges the sender so the bot never just stays silent.
   */
  private async handleGeneralMessage(msg: Message) {
    if (!this.bot) return;
    if (msg.contact) return; // handled by the 'contact' listener
    if (msg.text?.startsWith('/')) return; // commands handled elsewhere

    if (this.pendingSessionByChat.has(msg.chat.id)) {
      await this.bot.sendMessage(
        msg.chat.id,
        'Нажмите, пожалуйста, кнопку «Поделиться номером телефона» ниже, чтобы войти.',
      );
      return;
    }

    const content =
      msg.text ??
      (msg.photo
        ? '[фото]'
        : msg.sticker
          ? '[стикер]'
          : msg.document
            ? '[документ]'
            : msg.voice
              ? '[голосовое сообщение]'
              : '[сообщение]');

    const supportChatId = this.config.get<string>('TELEGRAM_SUPPORT_CHAT_ID');
    const from = msg.from;
    const who =
      [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() ||
      from?.username ||
      `id ${from?.id}`;
    const contact = from?.username
      ? `@${from.username}`
      : `без username, chatId ${msg.chat.id}`;

    if (supportChatId) {
      try {
        await this.bot.sendMessage(
          supportChatId,
          `📩 Обращение в поддержку от ${who} (${contact}):\n\n${content}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to forward support message: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `TELEGRAM_SUPPORT_CHAT_ID not set — support message from ${who} (${contact}) was not forwarded: "${content}"`,
      );
    }

    await this.bot.sendMessage(
      msg.chat.id,
      'Спасибо! Ваше сообщение передано в поддержку «Пульс», ответим здесь в ближайшее время 🙌',
    );
  }
}
