import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type UpsertPlaceInput = {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  citySlug: string;
  externalId?: string | null;
};

/** ~55m at mid-latitudes — merge nearby same-named spots. */
const NEAR_DEG = 0.0005;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

@Injectable()
export class PlacesService {
  constructor(private prisma: PrismaService) {}

  async upsertFromGeo(input: UpsertPlaceInput) {
    const name = input.name.trim();
    if (!name || input.lat == null || input.lng == null) {
      return null;
    }

    if (input.externalId) {
      const byExt = await this.prisma.place.findUnique({
        where: { externalId: input.externalId },
      });
      if (byExt) {
        return this.prisma.place.update({
          where: { id: byExt.id },
          data: {
            name,
            address: input.address ?? byExt.address,
            lat: input.lat,
            lng: input.lng,
            citySlug: input.citySlug,
          },
        });
      }
    }

    const near = await this.prisma.place.findMany({
      where: {
        lat: { gte: input.lat - NEAR_DEG, lte: input.lat + NEAR_DEG },
        lng: { gte: input.lng - NEAR_DEG, lte: input.lng + NEAR_DEG },
        citySlug: input.citySlug,
      },
      take: 20,
    });
    const key = normalizeName(name);
    const match = near.find((p) => normalizeName(p.name) === key);
    if (match) {
      return this.prisma.place.update({
        where: { id: match.id },
        data: {
          address: input.address ?? match.address,
          ...(input.externalId && !match.externalId
            ? { externalId: input.externalId }
            : {}),
        },
      });
    }

    return this.prisma.place.create({
      data: {
        name,
        address: input.address ?? null,
        lat: input.lat,
        lng: input.lng,
        citySlug: input.citySlug,
        externalId: input.externalId ?? null,
      },
    });
  }

  async findOne(id: string) {
    const now = new Date();
    const place = await this.prisma.place.findUnique({
      where: { id },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            reviewer: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
        events: {
          where: {
            status: 'ACTIVE',
            OR: [
              { endAt: { gte: now } },
              { endAt: null, startAt: { gte: now } },
            ],
          },
          orderBy: { startAt: 'asc' },
          take: 10,
          include: {
            host: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
      },
    });
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }

  async recomputeRating(placeId: string) {
    const agg = await this.prisma.placeReview.aggregate({
      where: { placeId },
      _avg: { stars: true },
      _count: true,
    });
    return this.prisma.place.update({
      where: { id: placeId },
      data: {
        ratingAvg: agg._avg.stars ?? 0,
        reviewsCount: agg._count,
      },
    });
  }
}
