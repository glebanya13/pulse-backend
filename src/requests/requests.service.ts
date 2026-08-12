import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GuestRequestStatus,
  GuestRequestType,
  NotificationType,
  Prisma,
  RequestOfferStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateGuestRequestDto } from './dto/create-guest-request.dto';
import { UpdateGuestRequestDto } from './dto/update-guest-request.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(authorId: string, dto: CreateGuestRequestDto) {
    if (dto.type === GuestRequestType.PERSONAL && !dto.targetHostId) {
      throw new BadRequestException(
        'targetHostId is required for PERSONAL requests',
      );
    }
    const requestedAt = new Date(dto.requestedAt);
    const requestedEndAt =
      dto.requestedEndAt != null ? new Date(dto.requestedEndAt) : null;
    if (requestedEndAt && requestedEndAt.getTime() < requestedAt.getTime()) {
      throw new BadRequestException(
        'requestedEndAt must be greater than or equal to requestedAt',
      );
    }
    const request = await this.prisma.guestRequest.create({
      data: {
        authorId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        portionsCount: dto.portionsCount,
        budgetType: dto.budgetType,
        budgetAmount: dto.budgetAmount,
        requestedAt,
        requestedEndAt,
        address: dto.address,
        targetHostId: dto.targetHostId,
        photos: dto.photos ?? [],
      },
    });

    if (dto.type === GuestRequestType.PERSONAL && dto.targetHostId) {
      await this.notifications.create(
        dto.targetHostId,
        NotificationType.NEW_REQUEST_MATCH,
        'Вам предложили запрос',
        request.title,
        { requestId: request.id },
      );
    }

    return request;
  }

  async findMany(userId: string, query: QueryRequestsDto) {
    const { page = 1, limit = 20 } = query;
    const where: Prisma.GuestRequestWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    // PERSONAL requests are only visible to their author or their target host.
    if (query.type === GuestRequestType.PERSONAL) {
      where.OR = [{ authorId: userId }, { targetHostId: userId }];
    } else if (!query.type) {
      where.OR = [
        { type: GuestRequestType.GENERAL },
        { authorId: userId },
        { targetHostId: userId },
      ];
    }

    const blockedIds = await this.blockedUserIds(userId);
    if (blockedIds.length > 0) where.authorId = { notIn: blockedIds };

    const [items, total] = await Promise.all([
      this.prisma.guestRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.guestRequest.count({ where }),
    ]);
    return { items, total, page, limit };
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

  async findOne(id: string) {
    const request = await this.prisma.guestRequest.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        offers: {
          include: {
            host: {
              select: { id: true, name: true, avatarUrl: true, rating: true },
            },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  async myRequests(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const where = { authorId: userId };
    const [items, total] = await Promise.all([
      this.prisma.guestRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { offers: true },
      }),
      this.prisma.guestRequest.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async update(id: string, userId: string, dto: UpdateGuestRequestDto) {
    const request = await this.findOne(id);
    if (request.authorId !== userId)
      throw new ForbiddenException('Only the author can edit this request');

    return this.prisma.guestRequest.update({
      where: { id },
      data: {
        ...dto,
        requestedAt: dto.requestedAt ? new Date(dto.requestedAt) : undefined,
      },
    });
  }

  async createOffer(requestId: string, hostId: string, dto: CreateOfferDto) {
    const request = await this.findOne(requestId);
    if (request.authorId === hostId) {
      throw new BadRequestException('You cannot offer on your own request');
    }
    const openStatuses: GuestRequestStatus[] = [
      GuestRequestStatus.OPEN,
      GuestRequestStatus.OFFERED,
    ];
    if (!openStatuses.includes(request.status)) {
      throw new BadRequestException(
        'This request is no longer open for offers',
      );
    }
    if (
      request.type === GuestRequestType.PERSONAL &&
      request.targetHostId !== hostId
    ) {
      throw new ForbiddenException(
        'This request was addressed to a different host',
      );
    }

    try {
      const offer = await this.prisma.requestOffer.create({
        data: { requestId, hostId, message: dto.message },
      });

      if (request.status === GuestRequestStatus.OPEN) {
        await this.prisma.guestRequest.update({
          where: { id: requestId },
          data: { status: GuestRequestStatus.OFFERED },
        });
      }

      await this.notifications.create(
        request.authorId,
        NotificationType.ORDER_OFFERED,
        'Новое предложение',
        `Исполнитель откликнулся на «${request.title}»`,
        { requestId, offerId: offer.id },
      );

      return offer;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'You have already made an offer on this request',
        );
      }
      throw e;
    }
  }

  async updateOfferStatus(
    offerId: string,
    userId: string,
    dto: UpdateOfferDto,
  ) {
    const offer = await this.prisma.requestOffer.findUnique({
      where: { id: offerId },
      include: { request: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.request.authorId !== userId) {
      throw new ForbiddenException(
        'Only the request author can accept or decline offers',
      );
    }
    if (offer.status !== RequestOfferStatus.PENDING) {
      throw new BadRequestException('This offer has already been processed');
    }

    if (dto.status === RequestOfferStatus.ACCEPTED) {
      await this.prisma.$transaction([
        this.prisma.requestOffer.update({
          where: { id: offerId },
          data: { status: RequestOfferStatus.ACCEPTED },
        }),
        this.prisma.requestOffer.updateMany({
          where: {
            requestId: offer.requestId,
            id: { not: offerId },
            status: RequestOfferStatus.PENDING,
          },
          data: { status: RequestOfferStatus.DECLINED },
        }),
        this.prisma.guestRequest.update({
          where: { id: offer.requestId },
          data: { status: GuestRequestStatus.ACCEPTED },
        }),
      ]);
      await this.notifications.create(
        offer.hostId,
        NotificationType.OFFER_ACCEPTED,
        'Предложение принято',
        `Ваше предложение по «${offer.request.title}» принято`,
        { requestId: offer.requestId },
      );
    } else {
      await this.prisma.requestOffer.update({
        where: { id: offerId },
        data: { status: RequestOfferStatus.DECLINED },
      });
      await this.notifications.create(
        offer.hostId,
        NotificationType.OFFER_DECLINED,
        'Предложение отклонено',
        `Ваше предложение по «${offer.request.title}» отклонено`,
        { requestId: offer.requestId },
      );
    }

    return this.prisma.requestOffer.findUnique({ where: { id: offerId } });
  }

  async withdrawOffer(offerId: string, hostId: string) {
    const offer = await this.prisma.requestOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.hostId !== hostId) {
      throw new ForbiddenException(
        'Only the offering host can withdraw this offer',
      );
    }
    if (offer.status !== RequestOfferStatus.PENDING) {
      throw new BadRequestException('Only a pending offer can be withdrawn');
    }

    await this.prisma.requestOffer.delete({ where: { id: offerId } });

    // If that was the last pending offer, drop the request back to OPEN.
    const remaining = await this.prisma.requestOffer.count({
      where: { requestId: offer.requestId, status: RequestOfferStatus.PENDING },
    });
    if (remaining === 0) {
      await this.prisma.guestRequest.updateMany({
        where: { id: offer.requestId, status: GuestRequestStatus.OFFERED },
        data: { status: GuestRequestStatus.OPEN },
      });
    }

    return { success: true };
  }
}
