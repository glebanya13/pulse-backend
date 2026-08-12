import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService, eventWindowEnd } from './events.service';

/**
 * Soft MVP: if the waiting window ended and minGuests were never accepted,
 * cancel the event and notify applicants (don’t leave a ghost ACTIVE row).
 */
@Injectable()
export class EventsThresholdCronService {
  private readonly logger = new Logger(EventsThresholdCronService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cancelUnmetThresholds() {
    const now = new Date();
    const candidates = await this.prisma.event.findMany({
      where: {
        status: EventStatus.ACTIVE,
        // Prefer endAt; legacy rows with null endAt use startAt via filter below.
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        minGuests: true,
        currentGuestsCount: true,
      },
      take: 200,
    });

    let cancelled = 0;
    for (const e of candidates) {
      if (eventWindowEnd(e).getTime() >= now.getTime()) continue;
      if (e.currentGuestsCount >= e.minGuests) continue;
      try {
        await this.events.cancelUnmetThreshold(e.id);
        cancelled += 1;
      } catch (err) {
        this.logger.warn(`Auto-cancel failed for ${e.id}: ${err}`);
      }
    }
    if (cancelled > 0) {
      this.logger.log(
        `Auto-cancelled ${cancelled} event(s) that did not reach minGuests`,
      );
    }
  }
}
