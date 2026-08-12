import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from './places.service';
import { CreatePlaceReviewDto } from './dto/create-place-review.dto';

function eventWindowEnd(event: { startAt: Date; endAt?: Date | null }): Date {
  return event.endAt ?? event.startAt;
}

@Injectable()
export class PlaceReviewsService {
  constructor(
    private prisma: PrismaService,
    private places: PlacesService,
  ) {}

  async create(reviewerId: string, placeId: string, dto: CreatePlaceReviewDto) {
    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Place not found');

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.placeId !== placeId) {
      throw new BadRequestException('Event is not linked to this place');
    }
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cancelled events cannot be reviewed');
    }
    if (
      event.status === EventStatus.ACTIVE &&
      eventWindowEnd(event).getTime() > Date.now()
    ) {
      throw new BadRequestException('Event has not finished yet');
    }

    const isHost = event.hostId === reviewerId;
    if (!isHost) {
      const app = await this.prisma.application.findFirst({
        where: {
          eventId: event.id,
          userId: reviewerId,
          status: ApplicationStatus.ACCEPTED,
        },
      });
      if (!app) {
        throw new ForbiddenException(
          'Only the host or accepted guests can review this place',
        );
      }
    }

    const existing = await this.prisma.placeReview.findUnique({
      where: {
        eventId_reviewerId: {
          eventId: event.id,
          reviewerId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('You already reviewed this place for the event');
    }

    const review = await this.prisma.placeReview.create({
      data: {
        placeId,
        eventId: event.id,
        reviewerId,
        stars: dto.stars,
        comment: dto.comment,
        photos: dto.photos ?? [],
      },
      include: {
        reviewer: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await this.places.recomputeRating(placeId);
    return review;
  }

  async mineForEvent(reviewerId: string, eventId: string) {
    return this.prisma.placeReview.findUnique({
      where: {
        eventId_reviewerId: { eventId, reviewerId },
      },
    });
  }
}
