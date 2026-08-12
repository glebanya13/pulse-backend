import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatsGateway } from './chats.gateway';

@Injectable()
export class ChatsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject(forwardRef(() => ChatsGateway))
    private gateway: ChatsGateway,
  ) {}

  /** Idempotent: returns the existing chat for the event, or creates one. */
  async getOrCreateForEvent(eventId: string) {
    const existing = await this.prisma.chat.findUnique({ where: { eventId } });
    if (existing) return existing;
    return this.prisma.chat.create({ data: { eventId } });
  }

  /**
   * Direct message between two users (no event). Idempotent for the pair.
   */
  async getOrCreateDm(myId: string, otherUserId: string) {
    if (myId === otherUserId) {
      throw new BadRequestException('Нельзя открыть чат с самим собой');
    }
    const other = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, isBlocked: true },
    });
    if (!other || other.isBlocked) {
      throw new NotFoundException('User not found');
    }

    const blocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: myId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: myId },
        ],
      },
    });
    if (blocked) {
      throw new ForbiddenException('Нельзя написать этому пользователю');
    }

    const candidates = await this.prisma.chat.findMany({
      where: {
        eventId: null,
        AND: [
          { participants: { some: { userId: myId } } },
          { participants: { some: { userId: otherUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });

    const existing = candidates.find((c) => {
      if (c.participants.length !== 2) return false;
      const ids = new Set(c.participants.map((p) => p.userId));
      return ids.has(myId) && ids.has(otherUserId);
    });
    if (existing) return existing;

    return this.prisma.chat.create({
      data: {
        participants: {
          create: [{ userId: myId }, { userId: otherUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
  }

  /** Chat id for an event if the user is already a participant (host or guest). */
  async findIdForEvent(eventId: string, userId: string): Promise<string | null> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        eventId,
        participants: { some: { userId } },
      },
      select: { id: true },
    });
    return chat?.id ?? null;
  }

  /**
   * Resolve the event chat for a participant without depending on the full
   * /chats list (which can fail client-side if any preview payload is partial).
   */
  async findByEvent(eventId: string, userId: string) {
    const chat = await this.prisma.chat.findFirst({
      where: {
        eventId,
        participants: { some: { userId } },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            photos: true,
            startAt: true,
            status: true,
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found for this event');
    }
    return chat;
  }

  async addParticipant(chatId: string, userId: string) {
    return this.prisma.chatParticipant.upsert({
      where: { chatId_userId: { chatId, userId } },
      create: { chatId, userId },
      update: {},
    });
  }

  /** Public for the WebSocket gateway (join room). */
  async ensureParticipant(chatId: string, userId: string) {
    await this.assertParticipant(chatId, userId);
  }

  private async assertParticipant(chatId: string, userId: string) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!participant)
      throw new ForbiddenException('You are not a participant of this chat');
  }

  async findMine(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: { participants: { some: { userId } } },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            photos: true,
            startAt: true,
            status: true,
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          // Client list tiles parse lastMessage.sender — without this include
          // the Flutter ChatMessage.fromJson cast crashes the whole /chats list.
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            chatId: chat.id,
            senderId: { not: userId },
            readBy: { none: { userId } },
          },
        });
        return { ...chat, unreadCount, isDirect: chat.eventId == null };
      }),
    );

    return {
      items,
      unreadTotal: items.reduce((sum, c) => sum + c.unreadCount, 0),
    };
  }

  async unreadTotal(userId: string) {
    const rows = await this.prisma.message.groupBy({
      by: ['chatId'],
      where: {
        senderId: { not: userId },
        readBy: { none: { userId } },
        chat: { participants: { some: { userId } } },
      },
      _count: { _all: true },
    });
    return {
      unreadTotal: rows.reduce((sum, r) => sum + r._count._all, 0),
    };
  }

  async getMessages(chatId: string, userId: string, pagination: PaginationDto) {
    await this.assertParticipant(chatId, userId);
    const { page = 1, limit = 30 } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.message.count({ where: { chatId } }),
    ]);
    return { items, total, page, limit };
  }

  async postMessage(chatId: string, userId: string, dto: SendMessageDto) {
    await this.assertParticipant(chatId, userId);

    const message = await this.prisma.message.create({
      data: { chatId, senderId: userId, text: dto.text },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    this.gateway.emitNewMessage(chatId, message);
    await this.notifyOthers(chatId, userId, dto.text.slice(0, 140), chatId);
    return message;
  }

  async postVoiceMessage(
    chatId: string,
    userId: string,
    file: Express.Multer.File,
    durationMs?: number,
  ) {
    await this.assertParticipant(chatId, userId);
    if (!file?.filename) {
      throw new BadRequestException('Audio file is required');
    }

    const audioUrl = `/uploads/${file.filename}`;
    const safeDuration =
      durationMs != null && durationMs >= 500 && durationMs <= 180_000
        ? durationMs
        : null;

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        text: '',
        audioUrl,
        durationMs: safeDuration,
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    this.gateway.emitNewMessage(chatId, message);
    await this.notifyOthers(chatId, userId, 'Голосовое сообщение', chatId);
    return message;
  }

  async postAttachmentMessage(
    chatId: string,
    userId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    await this.assertParticipant(chatId, userId);
    if (!file?.filename) {
      throw new BadRequestException('File is required');
    }

    const attachmentUrl = `/uploads/${file.filename}`;
    const mime = (file.mimetype || '').toLowerCase();
    const isImage =
      mime.startsWith('image/') ||
      ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif'].some((e) =>
        file.originalname.toLowerCase().endsWith(e),
      );
    const attachmentName = file.originalname?.slice(0, 200) || file.filename;
    const text = caption?.trim() || '';

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        text,
        attachmentUrl,
        attachmentName,
        attachmentMime: mime || (isImage ? 'image/jpeg' : 'application/octet-stream'),
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    this.gateway.emitNewMessage(chatId, message);
    await this.notifyOthers(
      chatId,
      userId,
      isImage ? 'Фото' : `Файл: ${attachmentName}`,
      chatId,
    );
    return message;
  }

  private async notifyOthers(
    chatId: string,
    senderId: string,
    preview: string,
    payloadChatId: string,
  ) {
    const others = await this.prisma.chatParticipant.findMany({
      where: { chatId, userId: { not: senderId } },
    });
    await Promise.all(
      others.map((p) =>
        this.notifications.create(
          p.userId,
          NotificationType.NEW_MESSAGE,
          'Новое сообщение',
          preview,
          { chatId: payloadChatId },
        ),
      ),
    );
  }

  async markRead(chatId: string, userId: string) {
    await this.assertParticipant(chatId, userId);
    const unread = await this.prisma.message.findMany({
      where: {
        chatId,
        senderId: { not: userId },
        readBy: { none: { userId } },
      },
      select: { id: true },
    });
    if (unread.length === 0) return { success: true, markedCount: 0 };

    await this.prisma.messageRead.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });
    return { success: true, markedCount: unread.length };
  }

  async assertExists(chatId: string) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }
}
