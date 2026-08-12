import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminActionType, EventStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { SetAuthorOfMonthDto } from './dto/set-author-of-month.dto';
import { SetSpecialProjectDto } from './dto/set-special-project.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import {
  authorMonthPeriod,
  formatAuthorMonthPeriodRu,
} from '../users/author-month';
import { AUTHOR_TALENT_MIN_LEVEL } from '../users/author-path';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private badges: BadgesService,
  ) {}

  private logAction(
    adminId: string,
    action: AdminActionType,
    targetType: string,
    targetId: string,
    details?: Prisma.InputJsonValue,
  ) {
    return this.prisma.adminActionLog.create({
      data: { adminId, action, targetType, targetId, details },
    });
  }

  async listUsers(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, page, limit };
  }

  async blockUser(adminId: string, id: string, dto: BlockUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isBlocked: dto.isBlocked },
    });
    await this.logAction(
      adminId,
      dto.isBlocked ? 'BLOCK_USER' : 'UNBLOCK_USER',
      'User',
      id,
    );
    return updated;
  }

  async listEvents(
    pagination: PaginationDto,
    status?: EventStatus | 'PENDING_REVIEW' | string,
  ) {
    const { page = 1, limit = 20 } = pagination;
    const where: Prisma.EventWhereInput = {};
    if (status) {
      where.status = status as EventStatus;
    }
    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { host: { select: { id: true, name: true, phone: true } } },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async cancelEvent(adminId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.logAction(adminId, 'CANCEL_EVENT', 'Event', id);
    return updated;
  }

  async approveEvent(adminId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.ACTIVE,
        moderationNote: null,
      },
      include: { host: { select: { id: true, name: true } } },
    });
    await this.logAction(adminId, 'APPROVE_EVENT', 'Event', id);
    await this.notifications.create(
      event.hostId,
      NotificationType.SPECIAL_PROJECT,
      'Событие одобрено',
      `«${event.title}» снова в афише`,
      { eventId: id },
    );
    return updated;
  }

  async rejectEvent(adminId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
      include: { host: { select: { id: true, name: true } } },
    });
    await this.logAction(adminId, 'REJECT_EVENT', 'Event', id, {
      moderationNote: event.moderationNote,
    });
    await this.notifications.create(
      event.hostId,
      NotificationType.EVENT_CANCELLED,
      'Событие отклонено',
      `«${event.title}» не прошло модерацию`,
      { eventId: id },
    );
    return updated;
  }

  /** Manual boost (no payment) — default 7 days, stacks from current end if active. */
  async boostEvent(adminId: string, id: string, days = 7) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const now = new Date();
    const base =
      event.boostedUntil && event.boostedUntil > now
        ? event.boostedUntil
        : now;
    const until = new Date(base);
    until.setDate(until.getDate() + days);
    const updated = await this.prisma.event.update({
      where: { id },
      data: { boostedUntil: until, boostedAt: now },
      include: { host: { select: { id: true, name: true } } },
    });
    await this.logAction(adminId, 'BOOST_EVENT', 'Event', id, {
      days,
      boostedUntil: until.toISOString(),
    });
    try {
      await this.notifications.create(
        event.hostId,
        NotificationType.SPECIAL_PROJECT,
        'Событие в топе',
        `«${event.title}» поднято в афише до ${until.toLocaleDateString('ru-RU')}`,
        { eventId: id },
      );
    } catch {
      // Non-fatal: entitlement already applied.
    }
    return updated;
  }

  /** Manual Organizer Pro (no payment) — default 30 days. */
  async grantOrganizerPro(adminId: string, userId: string, days = 30) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const now = new Date();
    const base =
      user.organizerProUntil && user.organizerProUntil > now
        ? user.organizerProUntil
        : now;
    const until = new Date(base);
    until.setDate(until.getDate() + days);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { organizerProUntil: until },
    });
    await this.logAction(adminId, 'GRANT_ORGANIZER_PRO', 'User', userId, {
      days,
      organizerProUntil: until.toISOString(),
    });
    try {
      await this.notifications.create(
        userId,
        NotificationType.SPECIAL_PROJECT,
        'Organizer Pro',
        `Pro активен до ${until.toLocaleDateString('ru-RU')}`,
      );
    } catch {
      // Non-fatal
    }
    return updated;
  }

  async listComplaints(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.complaint.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          reporter: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.complaint.count(),
    ]);
    return { items, total, page, limit };
  }

  async updateComplaint(adminId: string, id: string, dto: UpdateComplaintDto) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException('Complaint not found');
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.logAction(
      adminId,
      dto.status === 'RESOLVED' ? 'RESOLVE_COMPLAINT' : 'DISMISS_COMPLAINT',
      'Complaint',
      id,
    );
    return updated;
  }

  /** Deletes a review and recomputes the target's cached rating, same formula ReviewsService uses. */
  async deleteReview(adminId: string, id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    await this.prisma.review.delete({ where: { id } });

    const agg = await this.prisma.review.aggregate({
      where: { targetId: review.targetId },
      _avg: { overallScore: true },
      _count: true,
    });
    await this.prisma.user.update({
      where: { id: review.targetId },
      data: {
        rating: Math.round(agg._avg.overallScore ?? 100),
        reviewsCount: agg._count,
      },
    });

    await this.logAction(adminId, 'DELETE_REVIEW', 'Review', id, {
      targetId: review.targetId,
    });
    return { success: true };
  }

  async setTransactionStatus(
    adminId: string,
    id: string,
    status: 'SUCCESS' | 'FAILED',
  ) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction not found');
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { status },
    });
    await this.logAction(adminId, 'SET_TRANSACTION_STATUS', 'Transaction', id, {
      status,
    });
    return updated;
  }

  async listLogs(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.adminActionLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { admin: { select: { id: true, name: true, phone: true } } },
      }),
      this.prisma.adminActionLog.count(),
    ]);
    return { items, total, page, limit };
  }

  async stats() {
    const [
      users,
      blockedUsers,
      events,
      activeEvents,
      applications,
      requests,
      complaintsOpen,
      reviews,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isBlocked: true } }),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: 'ACTIVE' } }),
      this.prisma.application.count(),
      this.prisma.guestRequest.count(),
      this.prisma.complaint.count({ where: { status: 'OPEN' } }),
      this.prisma.review.count(),
    ]);
    return {
      users,
      blockedUsers,
      events,
      activeEvents,
      applications,
      requests,
      complaintsOpen,
      reviews,
    };
  }

  /** Talent pool for monthly nomination (L5+ by default). */
  async authorPool() {
    const items = await this.prisma.user.findMany({
      where: {
        authorLevel: { gte: AUTHOR_TALENT_MIN_LEVEL },
        isBlocked: false,
      },
      orderBy: [{ authorLevel: 'desc' }, { hostRating: 'desc' }],
      take: 50,
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        city: true,
        authorLevel: true,
        hostRating: true,
        hostReviewsCount: true,
        specialProject: true,
        authorOfMonthPeriod: true,
      },
    });
    return { items, period: authorMonthPeriod() };
  }

  async currentAuthorOfMonth() {
    const period = authorMonthPeriod();
    const row = await this.prisma.authorOfMonth.findUnique({
      where: { period },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            city: true,
            authorLevel: true,
            hostRating: true,
            hostReviewsCount: true,
            whatICook: true,
            bio: true,
            specialProject: true,
            authorOfMonthPeriod: true,
          },
        },
      },
    });
    if (!row) return { period, author: null };
    return {
      period,
      periodLabel: formatAuthorMonthPeriodRu(period),
      note: row.note,
      author: row.user,
    };
  }

  async setAuthorOfMonth(adminId: string, dto: SetAuthorOfMonthDto) {
    const period = dto.period ?? authorMonthPeriod();
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    // Clear previous holders of this period's cache flag.
    await this.prisma.user.updateMany({
      where: { authorOfMonthPeriod: period },
      data: { authorOfMonthPeriod: null },
    });

    await this.prisma.authorOfMonth.upsert({
      where: { period },
      create: {
        period,
        userId: dto.userId,
        note: dto.note,
        createdBy: adminId,
      },
      update: {
        userId: dto.userId,
        note: dto.note,
        createdBy: adminId,
      },
    });

    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { authorOfMonthPeriod: period },
    });

    await this.badges.awardBadge(dto.userId, 'AUTHOR_OF_MONTH');

    const label = formatAuthorMonthPeriodRu(period);
    await this.notifications.create(
      dto.userId,
      NotificationType.AUTHOR_OF_MONTH,
      'Вы — автор месяца',
      `Команда «Пульс» выбрала вас автором месяца · ${label}`,
      { period, userId: dto.userId },
    );

    await this.logAction(adminId, 'SET_AUTHOR_OF_MONTH', 'User', dto.userId, {
      period,
      note: dto.note ?? null,
    });

    return this.currentAuthorOfMonth();
  }

  async setSpecialProject(
    adminId: string,
    userId: string,
    dto: SetSpecialProjectDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { specialProject: dto.enabled },
    });

    if (dto.enabled) {
      await this.badges.awardBadge(userId, 'SPECIAL_PROJECT');
      await this.notifications.create(
        userId,
        NotificationType.SPECIAL_PROJECT,
        'Спецпроект',
        'Вас пригласили в спецпроект афиши «Пульс»',
        { userId },
      );
    }

    await this.logAction(adminId, 'SET_SPECIAL_PROJECT', 'User', userId, {
      enabled: dto.enabled,
    });

    return updated;
  }
}
