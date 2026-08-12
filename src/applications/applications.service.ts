import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  EventFormat,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService, eventWindowEnd } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { loadActivityFactsForUsers } from '../users/user-activity';
import {
  authorLevelUpCopy,
  syncAuthorLevelForUser,
} from '../users/author-path';

/** Host may mark / clear no-show only within this time after the event ends. */
const NO_SHOW_MARK_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Soft antifraud: max no-show marks a host can set per calendar day (UTC). */
const NO_SHOW_MARKS_PER_DAY = 20;

const APPLICANT_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  age: true,
  city: true,
  rating: true,
} as const;

function assertNoShowMarkWindow(event: {
  startAt: Date;
  endAt?: Date | null;
}) {
  const end = eventWindowEnd(event).getTime();
  const now = Date.now();
  if (end > now) {
    throw new BadRequestException(
      'You can mark a no-show only after the waiting window has ended',
    );
  }
  if (now - end > NO_SHOW_MARK_WINDOW_MS) {
    throw new BadRequestException(
      'No-show can only be marked within 48 hours after the event',
    );
  }
}

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService,
    private notifications: NotificationsService,
  ) {}

  private async withApplicantActivity<
    T extends { userId: string; user: Record<string, unknown> },
  >(items: T[]): Promise<(T & { user: T['user'] & { activity: unknown } })[]> {
    const facts = await loadActivityFactsForUsers(
      this.prisma,
      items.map((i) => i.userId),
    );
    return items.map((item) => ({
      ...item,
      user: {
        ...item.user,
        activity: facts.get(item.userId),
      },
    }));
  }

  async apply(eventId: string, userId: string, dto: CreateApplicationDto) {
    const event = await this.eventsService.findOne(eventId);
    if (event.hostId === userId) {
      throw new BadRequestException('Нельзя подать заявку на своё событие');
    }
    if (event.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Событие больше не принимает заявки',
      );
    }

    try {
      const application = await this.prisma.application.create({
        data: {
          eventId,
          userId,
          message: dto.message,
          pickupMethod: dto.pickupMethod,
        },
      });
      await this.notifications.create(
        event.hostId,
        NotificationType.APPLICATION_RECEIVED,
        'Новая заявка',
        `Новая заявка на «${event.title}»`,
        { eventId, applicationId: application.id },
      );
      return application;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Вы уже подали заявку на это событие');
      }
      throw e;
    }
  }

  async listForEvent(eventId: string, userId: string) {
    const event = await this.eventsService.findOne(eventId);
    if (event.hostId !== userId) {
      throw new ForbiddenException(
        'Only the host can view applications for this event',
      );
    }
    const items = await this.prisma.application.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: APPLICANT_SELECT },
      },
    });
    return this.withApplicantActivity(items);
  }

  async myApplications(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          event: {
            include: {
              host: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  age: true,
                  city: true,
                  rating: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    const eventIds = items.map((a) => a.eventId);
    const chats =
      eventIds.length === 0
        ? []
        : await this.prisma.chat.findMany({
            where: {
              eventId: { in: eventIds },
              participants: { some: { userId } },
            },
            select: { id: true, eventId: true },
          });
    const chatByEvent = new Map(
      chats
        .filter((c): c is { id: string; eventId: string } => c.eventId != null)
        .map((c) => [c.eventId, c.id]),
    );

    return {
      items: items.map((a) => ({
        ...a,
        event: {
          ...this.eventsService.withEffectiveStatus(a.event),
          chatId: chatByEvent.get(a.eventId) ?? null,
        },
        mutualAttendanceConfirmed: Boolean(
          a.guestConfirmedAt && a.hostConfirmedAt && !a.hostMarkedNoShowAt,
        ),
      })),
      total,
      page,
      limit,
    };
  }

  /** All pending applications on events hosted by this user. */
  async hostedPending(userId: string) {
    const items = await this.prisma.application.findMany({
      where: {
        status: ApplicationStatus.PENDING,
        event: { hostId: userId, status: 'ACTIVE' },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: APPLICANT_SELECT },
        event: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                age: true,
                city: true,
                rating: true,
              },
            },
          },
        },
      },
    });
    const withActivity = await this.withApplicantActivity(items);
    return {
      items: withActivity.map((a) => ({
        ...a,
        event: this.eventsService.withEffectiveStatus(
          this.eventsService.withThresholdMeta(a.event),
        ),
      })),
    };
  }

  async confirmAttendance(applicationId: string, userId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { event: true, user: { select: { id: true, name: true } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status !== ApplicationStatus.ACCEPTED) {
      throw new BadRequestException(
        'Only accepted guests can confirm attendance',
      );
    }
    if (application.event.startAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'You can confirm attendance only after the waiting window has started',
      );
    }
    if (eventWindowEnd(application.event).getTime() > Date.now()) {
      throw new BadRequestException(
        'You can confirm attendance only after the waiting window has ended',
      );
    }
    if (application.event.status === 'CANCELLED') {
      throw new BadRequestException('Cannot confirm a cancelled event');
    }

    const isGuest = application.userId === userId;
    const isHost = application.event.hostId === userId;
    if (!isGuest && !isHost) {
      throw new ForbiddenException(
        'Only the host or the guest can confirm attendance',
      );
    }

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: isGuest
        ? { guestConfirmedAt: application.guestConfirmedAt ?? new Date() }
        : {
            hostConfirmedAt: application.hostConfirmedAt ?? new Date(),
            hostMarkedNoShowAt: null,
          },
      include: {
        user: { select: APPLICANT_SELECT },
        event: true,
      },
    });

    const mutual = Boolean(
      updated.guestConfirmedAt &&
        updated.hostConfirmedAt &&
        !updated.hostMarkedNoShowAt,
    );
    if (mutual) {
      const notifyUserId = isGuest
        ? application.event.hostId
        : application.userId;
      const rateTargetId = isGuest
        ? application.userId
        : application.event.hostId;
      const rateRole = isGuest ? 'guest' : 'host';
      await this.notifications.create(
        notifyUserId,
        NotificationType.RATE_REMINDER,
        'Встреча подтверждена',
        `Вы можете оставить отзыв по «${application.event.title}»`,
        {
          eventId: application.eventId,
          applicationId,
          targetId: rateTargetId,
          role: rateRole,
        },
      );
    }

    return {
      ...updated,
      event: this.eventsService.withEffectiveStatus(updated.event),
      mutualAttendanceConfirmed: mutual,
    };
  }

  /** Host marks an accepted in-person guest as a no-show after the event. */
  async markNoShow(applicationId: string, userId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { event: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.event.hostId !== userId) {
      throw new ForbiddenException('Only the host can mark a no-show');
    }
    if (application.status !== ApplicationStatus.ACCEPTED) {
      throw new BadRequestException('Only accepted guests can be marked');
    }
    if (application.event.format !== EventFormat.IN_PERSON) {
      throw new BadRequestException(
        'No-show marking applies only to in-person events',
      );
    }
    if (application.event.status === 'CANCELLED') {
      throw new BadRequestException('Cannot mark no-show on a cancelled event');
    }
    assertNoShowMarkWindow(application.event);
    if (application.guestConfirmedAt && application.hostConfirmedAt) {
      throw new BadRequestException(
        'Cannot mark no-show after mutual attendance was confirmed',
      );
    }

    if (!application.hostMarkedNoShowAt) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const marksToday = await this.prisma.application.count({
        where: {
          hostMarkedNoShowAt: { gte: dayStart },
          event: { hostId: userId },
        },
      });
      if (marksToday >= NO_SHOW_MARKS_PER_DAY) {
        throw new BadRequestException(
          'Too many no-show marks today — try again tomorrow',
        );
      }
    }

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        hostMarkedNoShowAt: application.hostMarkedNoShowAt ?? new Date(),
        hostConfirmedAt: null,
      },
      include: {
        user: { select: APPLICANT_SELECT },
        event: true,
      },
    });

    await this.notifications.create(
      application.userId,
      NotificationType.ATTENDANCE_NO_SHOW,
      'Неявка',
      `Хозяин отметил, что вы не пришли на «${application.event.title}». Если это ошибка — откройте уведомление и пожалуйтесь.`,
      {
        eventId: application.eventId,
        applicationId,
        hostId: application.event.hostId,
      },
    );

    return {
      ...updated,
      event: this.eventsService.withEffectiveStatus(updated.event),
      mutualAttendanceConfirmed: false,
    };
  }

  /** Host clears a mistaken no-show within the 48h window. */
  async clearNoShow(applicationId: string, userId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { event: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.event.hostId !== userId) {
      throw new ForbiddenException('Only the host can clear a no-show');
    }
    if (!application.hostMarkedNoShowAt) {
      throw new BadRequestException('This guest is not marked as a no-show');
    }
    assertNoShowMarkWindow(application.event);

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: { hostMarkedNoShowAt: null },
      include: {
        user: { select: APPLICANT_SELECT },
        event: true,
      },
    });

    await this.notifications.create(
      application.userId,
      NotificationType.RATE_REMINDER,
      'Неявка снята',
      `Хозяин снял отметку неявки по «${application.event.title}»`,
      { eventId: application.eventId, applicationId },
    );

    return {
      ...updated,
      event: this.eventsService.withEffectiveStatus(updated.event),
      mutualAttendanceConfirmed: Boolean(
        updated.guestConfirmedAt && updated.hostConfirmedAt,
      ),
    };
  }

  async updateStatus(
    applicationId: string,
    userId: string,
    dto: UpdateApplicationDto,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { event: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.event.hostId !== userId) {
      throw new ForbiddenException(
        'Only the host can accept or reject applications',
      );
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(
        'This application has already been processed',
      );
    }
    const allowed: ApplicationStatus[] = [
      ApplicationStatus.ACCEPTED,
      ApplicationStatus.REJECTED,
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException('status must be ACCEPTED or REJECTED');
    }

    if (dto.status === ApplicationStatus.ACCEPTED) {
      if (application.event.status === 'CANCELLED') {
        throw new BadRequestException(
          'Cannot accept guests for a cancelled event',
        );
      }
      if (eventWindowEnd(application.event).getTime() < Date.now()) {
        throw new BadRequestException(
          'Event window has ended — cannot accept more guests',
        );
      }
      await this.eventsService.assertCanAcceptGuest(application.eventId);

      const { updated, chatId } = await this.prisma.$transaction(async (tx) => {
        const updatedApp = await tx.application.update({
          where: { id: applicationId },
          data: { status: ApplicationStatus.ACCEPTED },
        });

        const acceptedCount = await tx.application.count({
          where: {
            eventId: application.eventId,
            status: ApplicationStatus.ACCEPTED,
          },
        });
        await tx.event.update({
          where: { id: application.eventId },
          data: { currentGuestsCount: acceptedCount },
        });

        let chat = await tx.chat.findUnique({
          where: { eventId: application.eventId },
        });
        if (!chat) {
          chat = await tx.chat.create({
            data: { eventId: application.eventId },
          });
        }

        await tx.chatParticipant.upsert({
          where: {
            chatId_userId: {
              chatId: chat.id,
              userId: application.event.hostId,
            },
          },
          create: { chatId: chat.id, userId: application.event.hostId },
          update: {},
        });
        await tx.chatParticipant.upsert({
          where: {
            chatId_userId: {
              chatId: chat.id,
              userId: application.userId,
            },
          },
          create: { chatId: chat.id, userId: application.userId },
          update: {},
        });

        return { updated: updatedApp, chatId: chat.id };
      });

      await this.notifications.create(
        application.userId,
        NotificationType.APPLICATION_ACCEPTED,
        'Заявка принята',
        `Ваша заявка на «${application.event.title}» принята`,
        { eventId: application.eventId, chatId },
      );

      const claimed = await this.eventsService.tryClaimThresholdNotify(
        application.eventId,
        application.event.minGuests,
      );
      if (claimed) {
        await this.notifyThresholdReached(
          application.event,
          application.userId,
        );
      }

      await syncAuthorLevelForUser(this.prisma, application.event.hostId, {
        onLevelUp: async ({ to, title }) => {
          const copy = authorLevelUpCopy(to, title);
          await this.notifications.create(
            application.event.hostId,
            NotificationType.AUTHOR_LEVEL_UP,
            copy.title,
            copy.body,
            { level: to, authorLevel: to },
          );
        },
      });

      return { ...updated, chatId };
    }

    await this.notifications.create(
      application.userId,
      NotificationType.APPLICATION_REJECTED,
      'Заявка отклонена',
      `Ваша заявка на «${application.event.title}» отклонена`,
      { eventId: application.eventId },
    );

    return this.prisma.application.update({
      where: { id: applicationId },
      data: { status: dto.status },
    });
  }

  private async notifyThresholdReached(
    event: { id: string; hostId: string; title: string; minGuests: number },
    justAcceptedUserId: string,
  ) {
    const accepted = await this.prisma.application.findMany({
      where: { eventId: event.id, status: ApplicationStatus.ACCEPTED },
      select: { userId: true },
    });
    const recipientIds = new Set<string>([
      event.hostId,
      justAcceptedUserId,
      ...accepted.map((a) => a.userId),
    ]);
    const title = 'Набралось — можно готовить';
    const body = `На «${event.title}» уже ${event.minGuests}+ гостей. Встреча подтверждена набором.`;
    await Promise.all(
      [...recipientIds].map((uid) =>
        this.notifications.create(
          uid,
          NotificationType.EVENT_THRESHOLD_REACHED,
          title,
          body,
          { eventId: event.id, minGuests: event.minGuests },
        ),
      ),
    );
  }
}
