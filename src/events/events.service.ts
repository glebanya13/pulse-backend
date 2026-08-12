import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  EventStatus,
  NotificationType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  AUTHOR_TALENT_MIN_LEVEL,
  authorLevelUpCopy,
  syncAuthorLevelForUser,
} from '../users/author-path';
import { authorMonthPeriod } from '../users/author-month';
import { findCity } from '../cities/cities.catalog';
import { scanEventText } from '../moderation/event-content-filter';
import { PlacesService } from '../places/places.service';

/** End of the “waiting for guests” window; falls back to startAt. */
export function eventWindowEnd(event: {
  startAt: Date;
  endAt?: Date | null;
}): Date {
  return event.endAt ?? event.startAt;
}

function resolveCitySlug(slug?: string | null): string {
  const value = (slug ?? 'minsk').trim().toLowerCase();
  if (!findCity(value)) {
    throw new BadRequestException(`Unknown city: ${slug}`);
  }
  return value;
}

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private places: PlacesService,
  ) {}

  private parseWindow(dto: { startAt: string; endAt?: string }) {
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt != null ? new Date(dto.endAt) : null;
    if (endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException(
        'endAt must be greater than or equal to startAt',
      );
    }
    return { startAt, endAt };
  }

  async create(hostId: string, dto: CreateEventDto) {
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { role: true },
    });
    if (
      !host ||
      (host.role !== Role.PERFORMER && host.role !== Role.ADMIN)
    ) {
      throw new ForbiddenException(
        'Only organizers can create events. Become an organizer in the profile first.',
      );
    }

    const { startAt, endAt } = this.parseWindow(dto);
    const scan = scanEventText({
      title: dto.title,
      description: dto.description,
      tags: dto.tags,
      address: dto.address ?? dto.pickupAddress,
    });
    const status = scan.flagged
      ? EventStatus.PENDING_REVIEW
      : EventStatus.ACTIVE;
    const citySlug = resolveCitySlug(dto.citySlug);
    const placeId = await this.resolvePlaceId({ ...dto, citySlug });

    const event = await this.prisma.event.create({
      data: {
        hostId,
        format: dto.format,
        title: dto.title,
        description: dto.description,
        photos: dto.photos ?? [],
        tags: dto.tags ?? [],
        startAt,
        endAt,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        citySlug,
        placeId,
        minGuests: dto.minGuests ?? 1,
        maxGuests: dto.maxGuests ?? 1,
        priceType: dto.priceType,
        priceAmount: dto.priceAmount,
        requirementGender: dto.requirementGender,
        requirementMinAge: dto.requirementMinAge,
        requirementMaxAge: dto.requirementMaxAge,
        requirementInterests: dto.requirementInterests ?? [],
        pickupMethod: dto.pickupMethod,
        pickupAddress: dto.pickupAddress,
        portionWeightGrams: dto.portionWeightGrams,
        status,
        moderationNote: scan.flagged ? scan.matched.join(', ') : null,
      },
      include: { place: true },
    });

    if (status === EventStatus.ACTIVE) {
      await this.notifyFollowersOfNewEvent(hostId, event.id, event.title);
    } else {
      await this.notifications.create(
        hostId,
        NotificationType.SPECIAL_PROJECT,
        'Событие на проверке',
        `«${event.title}» отправлено на модерацию и появится в афише после одобрения`,
        { eventId: event.id },
      );
    }
    await this.prisma.user.update({
      where: { id: hostId },
      data: { eventsCount: { increment: 1 } },
    });
    await this.syncAuthorLevel(hostId);
    return event;
  }

  private async resolvePlaceId(dto: {
    placeName?: string | null;
    placeExternalId?: string | null;
    address?: string | null;
    pickupAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    citySlug?: string | null;
  }): Promise<string | undefined> {
    if (dto.lat == null || dto.lng == null) return undefined;
    const name =
      dto.placeName?.trim() ||
      dto.address?.trim() ||
      dto.pickupAddress?.trim() ||
      '';
    if (!name) return undefined;
    const place = await this.places.upsertFromGeo({
      name,
      address: dto.address ?? dto.pickupAddress,
      lat: dto.lat,
      lng: dto.lng,
      citySlug: resolveCitySlug(dto.citySlug),
      externalId: dto.placeExternalId,
    });
    return place?.id;
  }

  private async syncAuthorLevel(hostId: string) {
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

  /** Push + inbox for everyone following this host (skips block relationships). */
  private async notifyFollowersOfNewEvent(
    hostId: string,
    eventId: string,
    title: string,
  ) {
    const [host, followers] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: hostId },
        select: { name: true },
      }),
      this.prisma.userFollow.findMany({
        where: { followingId: hostId },
        select: { followerId: true },
      }),
    ]);
    if (followers.length === 0) return;

    const blockedRows = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: hostId }, { blockedId: hostId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set(
      blockedRows.map((r) =>
        r.blockerId === hostId ? r.blockedId : r.blockerId,
      ),
    );

    const hostName = host?.name?.trim() || 'Хозяин';
    const recipients = followers
      .map((f) => f.followerId)
      .filter((id) => !blockedIds.has(id));

    await Promise.all(
      recipients.map((userId) =>
        this.notifications.create(
          userId,
          NotificationType.HOST_NEW_EVENT,
          'Новое событие',
          `У ${hostName} новое событие «${title}»`,
          { eventId, hostId },
        ),
      ),
    );
  }

  /**
   * There's no scheduler flipping ACTIVE -> COMPLETED once an event's time
   * passes (Prisma stays the source of truth for ACTIVE/CANCELLED only), so
   * "completed" is derived at read time from the window end (endAt ?? startAt).
   */
  withEffectiveStatus<
    T extends { status: EventStatus; startAt: Date; endAt?: Date | null },
  >(event: T): T {
    if (
      event.status === EventStatus.ACTIVE &&
      eventWindowEnd(event).getTime() < Date.now()
    ) {
      return { ...event, status: EventStatus.COMPLETED };
    }
    return event;
  }

  /** Soft start threshold: minGuests accepted ⇒ host can start cooking. */
  withThresholdMeta<
    T extends {
      minGuests: number;
      currentGuestsCount: number;
    },
  >(
    event: T,
  ): T & {
    thresholdReached: boolean;
    guestsNeededForStart: number;
    isBoosted: boolean;
    hostIsOrganizerPro: boolean;
  } {
    const needed = Math.max(0, event.minGuests - event.currentGuestsCount);
    const now = new Date();
    const boostedUntil = (event as { boostedUntil?: Date | null }).boostedUntil;
    const host = (
      event as { host?: { organizerProUntil?: Date | null } | null }
    ).host;
    const isBoosted = !!(
      boostedUntil && boostedUntil.getTime() > now.getTime()
    );
    const hostIsOrganizerPro = !!(
      host?.organizerProUntil &&
      host.organizerProUntil.getTime() > now.getTime()
    );
    return {
      ...event,
      thresholdReached: needed === 0,
      guestsNeededForStart: needed,
      isBoosted,
      hostIsOrganizerPro,
    };
  }

  async findMany(query: QueryEventsDto, userId?: string) {
    const { page = 1, limit = 20 } = query;
    const now = new Date();

    // Still open: window end is in the future (or legacy point-in-time startAt).
    let openWindow: Prisma.EventWhereInput = {
      OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }],
    };

    if (query.dateFrom || query.dateTo) {
      const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
      openWindow = {
        OR: [
          {
            endAt: { not: null, ...(dateFrom ? { gte: dateFrom } : {}) },
            ...(dateTo ? { startAt: { lte: dateTo } } : {}),
          },
          {
            endAt: null,
            startAt: {
              ...(dateFrom ? { gte: dateFrom } : { gte: now }),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
        ],
      };
    }

    const and: Prisma.EventWhereInput[] = [openWindow];
    const where: Prisma.EventWhereInput = {
      status: EventStatus.ACTIVE,
      AND: and,
    };

    if (query.format) where.format = query.format;
    if (query.priceType) where.priceType = query.priceType;
    if (query.city) {
      where.citySlug = resolveCitySlug(query.city);
    }
    const tagList = [
      ...(query.tags ?? []),
      ...(query.category ? [query.category] : []),
    ];
    const uniqueTags = [...new Set(tagList)];
    if (uniqueTags.length === 1) {
      where.tags = { has: uniqueTags[0] };
    } else if (uniqueTags.length > 1) {
      where.tags = { hasSome: uniqueTags };
    }
    const hostFilters: Prisma.UserWhereInput[] = [];
    if (query.minHostRating != null) {
      hostFilters.push({ rating: { gte: query.minHostRating } });
    }
    if (query.talentsOnly) {
      hostFilters.push({ authorLevel: { gte: AUTHOR_TALENT_MIN_LEVEL } });
    }
    if (hostFilters.length === 1) {
      where.host = hostFilters[0];
    } else if (hostFilters.length > 1) {
      where.host = { AND: hostFilters };
    }

    let blockedIds: string[] = [];
    if (userId) {
      blockedIds = await this.blockedUserIds(userId);
    }

    if (query.followingOnly) {
      if (!userId) {
        return { items: [], total: 0, page, limit };
      }
      const follows = await this.prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const followingIds = follows
        .map((f) => f.followingId)
        .filter((id) => !blockedIds.includes(id));
      if (followingIds.length === 0) {
        return { items: [], total: 0, page, limit };
      }
      where.hostId = { in: followingIds };
    } else if (blockedIds.length > 0) {
      where.hostId = { notIn: blockedIds };
    }
    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    // Geo filtering: explicit bbox takes precedence over center+radius.
    let minLat = query.minLat;
    let minLng = query.minLng;
    let maxLat = query.maxLat;
    let maxLng = query.maxLng;

    if (
      (minLat === undefined ||
        minLng === undefined ||
        maxLat === undefined ||
        maxLng === undefined) &&
      query.lat !== undefined &&
      query.lng !== undefined
    ) {
      const radiusKm = query.radiusKm ?? 10;
      const deltaLat = radiusKm / 111;
      const deltaLng =
        radiusKm / (111 * Math.cos((query.lat * Math.PI) / 180) || 1);
      minLat = query.lat - deltaLat;
      maxLat = query.lat + deltaLat;
      minLng = query.lng - deltaLng;
      maxLng = query.lng + deltaLng;
    }

    if (minLat !== undefined && maxLat !== undefined) {
      where.lat = { gte: minLat, lte: maxLat };
    }
    if (minLng !== undefined && maxLng !== undefined) {
      where.lng = { gte: minLng, lte: maxLng };
    }

    const hostInclude = {
      select: {
        id: true,
        name: true,
        age: true,
        avatarUrl: true,
        rating: true,
        hostRating: true,
        hostReviewsCount: true,
        reviewsCount: true,
        city: true,
        authorLevel: true,
        authorOfMonthPeriod: true,
        specialProject: true,
        organizerProUntil: true,
        badges: {
          take: 4,
          orderBy: { earnedAt: 'desc' as const },
          include: { badge: true },
        },
      },
    };
    const eventInclude = { host: hostInclude, place: true as const };

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: eventInclude,
      }),
      this.prisma.event.count({ where }),
    ]);

    // Soft boost: page 1 pins paid boosts, then Pro hosts / author-path.
    let ordered = items;
    if (
      page === 1 &&
      !query.followingOnly &&
      !query.talentsOnly &&
      items.length > 0
    ) {
      const period = authorMonthPeriod();
      const paidBoosted = await this.prisma.event.findMany({
        where: {
          ...where,
          boostedUntil: { gt: now },
        },
        orderBy: [{ boostedAt: 'desc' }, { startAt: 'asc' }],
        take: 5,
        include: eventInclude,
      });
      const spotlightHost: Prisma.UserWhereInput = {
        AND: [
          ...(hostFilters.length > 0 ? hostFilters : []),
          {
            OR: [
              { organizerProUntil: { gt: now } },
              { authorOfMonthPeriod: period },
              { authorLevel: { gte: AUTHOR_TALENT_MIN_LEVEL } },
            ],
          },
        ],
      };
      const featured = await this.prisma.event.findMany({
        where: {
          ...where,
          host: spotlightHost,
        },
        orderBy: [
          { host: { organizerProUntil: 'desc' } },
          { host: { authorOfMonthPeriod: 'desc' } },
          { startAt: 'asc' },
        ],
        take: 3,
        include: eventInclude,
      });
      if (paidBoosted.length > 0 || featured.length > 0) {
        const seen = new Set<string>();
        const merged: typeof items = [];
        for (const e of [...paidBoosted, ...featured, ...items]) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          merged.push(e);
          if (merged.length >= limit) break;
        }
        ordered = merged;
      }
    }

    const favoritedIds = await this.favoritedEventIds(
      userId,
      ordered.map((e) => e.id),
    );
    const withMeta = ordered.map((e) =>
      this.withThresholdMeta({ ...e, isFavorite: favoritedIds.has(e.id) }),
    );
    const withFriends = await this.attachFriendsGoing(withMeta, userId);
    return {
      items: withFriends,
      total,
      page,
      limit,
    };
  }

  private async blockedUserIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) =>
      r.blockerId === userId ? r.blockedId : r.blockerId,
    );
  }

  async findOne(id: string, userId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            age: true,
            avatarUrl: true,
            rating: true,
            hostRating: true,
            hostReviewsCount: true,
            city: true,
            eventsCount: true,
            reviewsCount: true,
            authorLevel: true,
            authorOfMonthPeriod: true,
            specialProject: true,
            organizerProUntil: true,
            badges: {
              take: 4,
              orderBy: { earnedAt: 'desc' as const },
              include: { badge: true },
            },
          },
        },
        place: true,
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status === EventStatus.PENDING_REVIEW) {
      const allowed = await this.canSeePendingReview(event.hostId, userId);
      if (!allowed) throw new NotFoundException('Event not found');
    }
    if (userId) {
      const blockedIds = await this.blockedUserIds(userId);
      if (blockedIds.includes(event.hostId)) {
        throw new NotFoundException('Event not found');
      }
    }
    const [favoritedIds, acceptedCount, chat] = await Promise.all([
      this.favoritedEventIds(userId, [id]),
      this.prisma.application.count({
        where: { eventId: id, status: ApplicationStatus.ACCEPTED },
      }),
      userId
        ? this.prisma.chat.findFirst({
            where: {
              eventId: id,
              participants: { some: { userId } },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    // Accepted applications are the source of truth — heal drifted counters
    // so the "Набор до старта" badge never lags behind accepts.
    let currentGuestsCount = event.currentGuestsCount;
    if (acceptedCount !== event.currentGuestsCount) {
      const healed = await this.prisma.event.update({
        where: { id },
        data: { currentGuestsCount: acceptedCount },
        select: { currentGuestsCount: true },
      });
      currentGuestsCount = healed.currentGuestsCount;
    }

    return this.attachFriendsGoingOne(
      this.withThresholdMeta(
        this.withEffectiveStatus({
          ...event,
          currentGuestsCount,
          isFavorite: favoritedIds.has(id),
          chatId: chat?.id ?? null,
        }),
      ),
      userId,
    );
  }

  private async attachFriendsGoing<T extends { id: string }>(
    events: T[],
    userId?: string,
  ): Promise<
    (T & {
      friendsGoing: { id: string; name: string; avatarUrl: string | null }[];
      friendsGoingCount: number;
    })[]
  > {
    if (!userId || events.length === 0) {
      return events.map((e) => ({
        ...e,
        friendsGoing: [],
        friendsGoingCount: 0,
      }));
    }
    const following = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    if (followingIds.length === 0) {
      return events.map((e) => ({
        ...e,
        friendsGoing: [],
        friendsGoingCount: 0,
      }));
    }

    const apps = await this.prisma.application.findMany({
      where: {
        eventId: { in: events.map((e) => e.id) },
        status: ApplicationStatus.ACCEPTED,
        userId: { in: followingIds },
      },
      select: {
        eventId: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      take: 300,
    });

    const byEvent = new Map<
      string,
      { id: string; name: string; avatarUrl: string | null }[]
    >();
    for (const a of apps) {
      const list = byEvent.get(a.eventId) ?? [];
      if (list.length < 3) {
        list.push({
          id: a.user.id,
          name: a.user.name ?? '',
          avatarUrl: a.user.avatarUrl,
        });
      }
      byEvent.set(a.eventId, list);
    }

    const counts = new Map<string, number>();
    for (const a of apps) {
      counts.set(a.eventId, (counts.get(a.eventId) ?? 0) + 1);
    }

    return events.map((e) => ({
      ...e,
      friendsGoing: byEvent.get(e.id) ?? [],
      friendsGoingCount: counts.get(e.id) ?? 0,
    }));
  }

  private async attachFriendsGoingOne<T extends { id: string }>(
    event: T,
    userId?: string,
  ) {
    const [only] = await this.attachFriendsGoing([event], userId);
    return only;
  }

  async recordView(id: string, viewerId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, hostId: true, viewCount: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (viewerId && viewerId === event.hostId) {
      return { viewCount: event.viewCount };
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return updated;
  }

  async stats(id: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.hostId !== userId) {
      throw new ForbiddenException('Only the host can view stats');
    }
    const [applicationsCount, acceptedCount] = await Promise.all([
      this.prisma.application.count({ where: { eventId: id } }),
      this.prisma.application.count({
        where: { eventId: id, status: ApplicationStatus.ACCEPTED },
      }),
    ]);
    const now = new Date();
    return {
      viewCount: event.viewCount,
      applicationsCount,
      acceptedCount,
      isBoosted: !!(
        event.boostedUntil && event.boostedUntil.getTime() > now.getTime()
      ),
      boostedUntil: event.boostedUntil,
      currentGuestsCount: event.currentGuestsCount,
    };
  }

  private async favoritedEventIds(
    userId: string | undefined,
    eventIds: string[],
  ): Promise<Set<string>> {
    if (!userId || eventIds.length === 0) return new Set();
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, eventId: { in: eventIds } },
      select: { eventId: true },
    });
    return new Set(favorites.map((f) => f.eventId));
  }

  async findMine(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const where = { hostId: userId };
    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      items: items.map((e) =>
        this.withThresholdMeta(this.withEffectiveStatus(e)),
      ),
      total,
      page,
      limit,
    };
  }

  private async canSeePendingReview(
    hostId: string,
    userId?: string,
  ): Promise<boolean> {
    if (!userId) return false;
    if (userId === hostId) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isAdmin: true },
    });
    return !!(user && (user.role === Role.ADMIN || user.isAdmin));
  }

  async update(id: string, userId: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Event not found');
    if (existing.hostId !== userId)
      throw new ForbiddenException('Only the host can edit this event');
    if (existing.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cancelled events cannot be edited');
    }

    const nextStart = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const nextEnd =
      dto.endAt !== undefined
        ? dto.endAt
          ? new Date(dto.endAt)
          : null
        : existing.endAt;
    if (nextEnd && nextEnd.getTime() < nextStart.getTime()) {
      throw new BadRequestException(
        'endAt must be greater than or equal to startAt',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      startAt: _s,
      endAt: _e,
      citySlug: citySlugRaw,
      placeName: _pn,
      placeExternalId: _pe,
      ...rest
    } = dto;
    const citySlug =
      citySlugRaw !== undefined ? resolveCitySlug(citySlugRaw) : undefined;

    const nextTitle = dto.title ?? existing.title;
    const nextDescription =
      dto.description !== undefined ? dto.description : existing.description;
    const nextTags = dto.tags ?? existing.tags;
    const nextAddress =
      dto.address !== undefined ? dto.address : existing.address;
    const nextPickup =
      dto.pickupAddress !== undefined
        ? dto.pickupAddress
        : existing.pickupAddress;
    const nextLat = dto.lat !== undefined ? dto.lat : existing.lat;
    const nextLng = dto.lng !== undefined ? dto.lng : existing.lng;
    const nextCity = citySlug ?? existing.citySlug;

    const scan = scanEventText({
      title: nextTitle,
      description: nextDescription,
      tags: nextTags,
      address: nextAddress ?? nextPickup,
    });

    const moderationPatch = scan.flagged
      ? {
          status: EventStatus.PENDING_REVIEW,
          moderationNote: scan.matched.join(', '),
        }
      : existing.status === EventStatus.PENDING_REVIEW
        ? {
            moderationNote: null as string | null,
          }
        : { moderationNote: null as string | null };

    const placeId = await this.resolvePlaceId({
      placeName: dto.placeName,
      placeExternalId: dto.placeExternalId,
      address: nextAddress,
      pickupAddress: nextPickup,
      lat: nextLat,
      lng: nextLng,
      citySlug: nextCity,
    });

    return this.prisma.event.update({
      where: { id },
      data: {
        ...rest,
        ...(citySlug !== undefined ? { citySlug } : {}),
        ...(dto.startAt !== undefined ? { startAt: nextStart } : {}),
        ...(dto.endAt !== undefined ? { endAt: nextEnd } : {}),
        ...(placeId ? { placeId } : {}),
        ...moderationPatch,
      },
      include: { place: true },
    });
  }

  async remove(id: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.hostId !== userId)
      throw new ForbiddenException('Only the host can delete this event');
    await this.prisma.event.delete({ where: { id } });
    return { success: true };
  }

  /** Soft cancel: keep the row, notify guests, stop applications. */
  async cancel(id: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.hostId !== userId) {
      throw new ForbiddenException('Only the host can cancel this event');
    }
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled');
    }
    return this.cancelAndNotify(id, event.title, 'host');
  }

  /**
   * System auto-cancel when the waiting window ended without reaching minGuests.
   */
  async cancelUnmetThreshold(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event || event.status !== EventStatus.ACTIVE) return null;
    if (event.currentGuestsCount >= event.minGuests) return null;
    if (eventWindowEnd(event).getTime() >= Date.now()) return null;
    return this.cancelAndNotify(id, event.title, 'threshold');
  }

  private async cancelAndNotify(
    id: string,
    title: string,
    reason: 'host' | 'threshold',
  ) {
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
    });

    await this.prisma.user.updateMany({
      where: { id: updated.hostId, eventsCount: { gt: 0 } },
      data: { eventsCount: { decrement: 1 } },
    });

    const applicants = await this.prisma.application.findMany({
      where: {
        eventId: id,
        status: {
          in: [ApplicationStatus.ACCEPTED, ApplicationStatus.PENDING],
        },
      },
      select: { userId: true, status: true },
    });

    const notifTitle =
      reason === 'threshold' ? 'Событие не набралось' : 'Событие отменено';
    await Promise.all(
      applicants.map((a) =>
        this.notifications.create(
          a.userId,
          NotificationType.EVENT_CANCELLED,
          notifTitle,
          reason === 'threshold'
            ? `«${title}» отменено: не набралось минимум гостей к концу окна.`
            : a.status === ApplicationStatus.ACCEPTED
              ? `Хозяин отменил «${title}». Встреча не состоится.`
              : `«${title}» отменено — заявка больше не актуальна.`,
          { eventId: id, reason },
        ),
      ),
    );

    return this.withThresholdMeta(this.withEffectiveStatus(updated));
  }

  /** Used internally by ApplicationsService when accepting an applicant. */
  async assertCanAcceptGuest(eventId: string) {
    const event = await this.findOne(eventId);
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot accept guests for a cancelled event',
      );
    }
    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException(
        'Event window has ended — cannot accept more guests',
      );
    }
    if (event.currentGuestsCount >= event.maxGuests) {
      throw new ForbiddenException(
        'Event has reached its maximum number of guests',
      );
    }
    return event;
  }

  /** @deprecated Prefer assertCanAcceptGuest */
  async assertHasCapacity(eventId: string) {
    return this.assertCanAcceptGuest(eventId);
  }

  /**
   * Atomically claim the one-shot threshold notification.
   * Returns true only for the first caller that crosses minGuests.
   */
  async tryClaimThresholdNotify(
    eventId: string,
    minGuests: number,
  ): Promise<boolean> {
    const result = await this.prisma.event.updateMany({
      where: {
        id: eventId,
        thresholdNotifiedAt: null,
        currentGuestsCount: { gte: minGuests },
      },
      data: { thresholdNotifiedAt: new Date() },
    });
    return result.count === 1;
  }

  async incrementGuestCount(eventId: string) {
    return this.prisma.event.update({
      where: { id: eventId },
      data: { currentGuestsCount: { increment: 1 } },
    });
  }
}
