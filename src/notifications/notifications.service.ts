import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FirebaseAdminService } from '../oauth/firebase-admin.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private firebase: FirebaseAdminService,
  ) {}

  /** Internal helper used by other modules to create a notification. */
  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, payload },
    });

    // Fire-and-forget push — failures must not roll back the inbox row.
    void this.pushIfPossible(
      userId,
      type,
      title,
      body,
      notification.id,
      payload,
    );

    return notification;
  }

  private async pushIfPossible(
    userId: string,
    type: NotificationType,
    title: string,
    body: string | undefined,
    notificationId: string,
    payload?: Prisma.InputJsonValue,
  ) {
    try {
      if (!this.firebase.isConfigured()) return;
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
      });
      const token = user?.fcmToken?.trim();
      if (!token) return;

      const data: Record<string, string> = {
        type,
        notificationId,
      };
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        for (const [k, v] of Object.entries(
          payload as Record<string, unknown>,
        )) {
          if (v == null) continue;
          data[k] = String(v);
        }
      }
      await this.firebase.sendToDevice({ token, title, body, data });
    } catch (err) {
      this.logger.warn(`Push skipped for user ${userId}: ${err}`);
    }
  }

  async findMine(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException();
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }
}
