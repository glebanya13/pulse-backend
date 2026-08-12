import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EVENT_HOST_SELECT = {
  host: {
    select: { id: true, name: true, avatarUrl: true, rating: true, city: true },
  },
} as const;

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async add(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    await this.prisma.favorite.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId },
      update: {},
    });
    return { favorited: true };
  }

  async remove(userId: string, eventId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, eventId } });
    return { favorited: false };
  }

  async findMine(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { event: { include: EVENT_HOST_SELECT } },
    });
    return favorites.map((f) => f.event);
  }
}
