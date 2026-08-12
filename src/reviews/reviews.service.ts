import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { computeOverallScore } from './rating-score';
import { loadActivityFactsForUsers } from '../users/user-activity';
import {
  authorLevelUpCopy,
  syncAuthorLevelForUser,
} from '../users/author-path';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private badges: BadgesService,
  ) {}

  private async assertParticipant(
    eventId: string,
    userId: string,
  ): Promise<boolean> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.hostId === userId) return true;
    const accepted = await this.prisma.application.findFirst({
      where: { eventId, userId, status: ApplicationStatus.ACCEPTED },
    });
    return !!accepted;
  }

  async create(eventId: string, reviewerId: string, dto: CreateReviewDto) {
    if (dto.targetId === reviewerId) {
      throw new BadRequestException('You cannot review yourself');
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status === 'CANCELLED') {
      throw new BadRequestException('Cannot review a cancelled event');
    }
    // No scheduler flips ACTIVE -> COMPLETED, so "the meeting happened" is
    // derived from startAt — see EventsService.withEffectiveStatus.
    if (event.status === 'ACTIVE' && event.startAt.getTime() >= Date.now()) {
      throw new BadRequestException(
        'You can only leave a review after the event has taken place',
      );
    }

    const [reviewerIsParticipant, targetIsParticipant] = await Promise.all([
      this.assertParticipant(eventId, reviewerId),
      this.assertParticipant(eventId, dto.targetId),
    ]);
    if (!reviewerIsParticipant) {
      throw new ForbiddenException(
        'Only the host or an accepted guest of this event can leave a review',
      );
    }
    if (!targetIsParticipant) {
      throw new BadRequestException(
        'Review target did not participate in this event',
      );
    }

    // Mutual attendance: guest↔host must both confirm before rating.
    const guestUserId =
      event.hostId === reviewerId
        ? dto.targetId
        : event.hostId === dto.targetId
          ? reviewerId
          : null;
    if (!guestUserId) {
      throw new BadRequestException(
        'Reviews are only between the host and an accepted guest',
      );
    }
    const application = await this.prisma.application.findFirst({
      where: {
        eventId,
        userId: guestUserId,
        status: ApplicationStatus.ACCEPTED,
      },
    });
    if (!application) {
      throw new BadRequestException(
        'Review target did not participate in this event',
      );
    }
    if (application.hostMarkedNoShowAt) {
      throw new BadRequestException(
        'Cannot leave a review for a guest marked as no-show',
      );
    }
    if (!application.guestConfirmedAt || !application.hostConfirmedAt) {
      throw new BadRequestException(
        'Both host and guest must confirm attendance before leaving a review',
      );
    }

    const scoreValues = Object.values(dto.scores).filter(
      (v): v is number => typeof v === 'number',
    );
    if (scoreValues.length === 0) {
      throw new BadRequestException('At least one score category is required');
    }
    let overallScore: number;
    try {
      overallScore = computeOverallScore(
        dto.scores as unknown as Record<string, unknown>,
        dto.targetRole as 'HOST' | 'GUEST',
      );
    } catch {
      throw new BadRequestException('At least one score category is required');
    }

    let review;
    try {
      review = await this.prisma.review.create({
        data: {
          eventId,
          reviewerId,
          targetId: dto.targetId,
          targetRole: dto.targetRole,
          scores: dto.scores as unknown as Prisma.InputJsonValue,
          overallScore,
          comment: dto.comment,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'You have already reviewed this user for this event',
        );
      }
      throw e;
    }

    const [hostAgg, guestAgg] = await Promise.all([
      this.prisma.review.aggregate({
        where: { targetId: dto.targetId, targetRole: 'HOST' },
        _avg: { overallScore: true },
        _count: true,
      }),
      this.prisma.review.aggregate({
        where: { targetId: dto.targetId, targetRole: 'GUEST' },
        _avg: { overallScore: true },
        _count: true,
      }),
    ]);
    const hostReviewsCount = hostAgg._count;
    const guestReviewsCount = guestAgg._count;
    const hostRating =
      hostReviewsCount > 0
        ? Math.round(hostAgg._avg.overallScore ?? overallScore)
        : 100;
    const guestRating =
      guestReviewsCount > 0
        ? Math.round(guestAgg._avg.overallScore ?? overallScore)
        : 100;
    // Public card rating = host portrait when available (trust for dinners).
    const rating =
      hostReviewsCount > 0
        ? hostRating
        : guestReviewsCount > 0
          ? guestRating
          : 100;
    await this.prisma.user.update({
      where: { id: dto.targetId },
      data: {
        hostRating,
        hostReviewsCount,
        guestRating,
        guestReviewsCount,
        rating,
        reviewsCount: hostReviewsCount + guestReviewsCount,
      },
    });

    await this.badges.evaluateForUser(dto.targetId);
    if (event.hostId === dto.targetId) {
      // Host rating path — also refresh FIRST_EVENT etc. (eventsCount already set).
    } else if (event.hostId === reviewerId) {
      await this.badges.evaluateForUser(event.hostId);
    }

    // Author path levels depend on host reviews / criterion badges.
    if (event.hostId === dto.targetId || event.hostId === reviewerId) {
      const hostId = event.hostId;
      await syncAuthorLevelForUser(this.prisma, hostId, {
        onLevelUp: async ({ to, title }) => {
          const copy = authorLevelUpCopy(to, title);
          await this.notifications.create(
            hostId,
            NotificationType.AUTHOR_LEVEL_UP,
            copy.title,
            copy.body,
            { level: to, authorLevel: to },
          );
        },
      });
    }

    await this.notifications.create(
      dto.targetId,
      NotificationType.NEW_REVIEW,
      'Новый отзыв',
      dto.comment ?? `Вам поставили оценку ${overallScore}/100`,
      { eventId, reviewId: review.id },
    );

    return review;
  }

  async findForUser(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const where = { targetId: userId };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              age: true,
              city: true,
              badges: {
                take: 3,
                orderBy: { earnedAt: 'desc' },
                include: { badge: true },
              },
            },
          },
          event: { select: { id: true, title: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const facts = await loadActivityFactsForUsers(
      this.prisma,
      items.map((r) => r.reviewerId),
    );

    return {
      items: items.map((r) => ({
        ...r,
        reviewer: {
          ...r.reviewer,
          activity: facts.get(r.reviewerId),
        },
      })),
      total,
      page,
      limit,
    };
  }
}
