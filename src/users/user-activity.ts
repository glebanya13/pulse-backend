import { ApplicationStatus, EventFormat, PrismaClient } from '@prisma/client';

export type UserActivityFacts = {
  attendedMeetings: number;
  hostedDinners: number;
  takeawayOrdersPrepared: number;
  noShowCount: number;
  attendanceMarkedTotal: number;
  /** 0–1 when enough samples (≥5 marked visits); otherwise null. */
  noShowRatio: number | null;
};

/** Public no-show signal only after this many marked visits. */
export const NO_SHOW_RATIO_MIN_SAMPLES = 5;

const EMPTY: UserActivityFacts = {
  attendedMeetings: 0,
  hostedDinners: 0,
  takeawayOrdersPrepared: 0,
  noShowCount: 0,
  attendanceMarkedTotal: 0,
  noShowRatio: null,
};

type Db = Pick<PrismaClient, 'application' | 'event'>;

function withRatio(
  partial: Omit<UserActivityFacts, 'attendanceMarkedTotal' | 'noShowRatio'>,
): UserActivityFacts {
  const attendanceMarkedTotal = partial.attendedMeetings + partial.noShowCount;
  return {
    ...partial,
    attendanceMarkedTotal,
    noShowRatio:
      attendanceMarkedTotal >= NO_SHOW_RATIO_MIN_SAMPLES
        ? Math.round((partial.noShowCount / attendanceMarkedTotal) * 1000) /
          1000
        : null,
  };
}

/** Live activity counters used on profiles, reviews, and applications. */
export async function loadActivityFactsForUsers(
  prisma: Db,
  userIds: string[],
): Promise<Map<string, UserActivityFacts>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, UserActivityFacts>();
  for (const id of unique) map.set(id, { ...EMPTY });
  if (unique.length === 0) return map;

  await Promise.all(
    unique.map(async (userId) => {
      const [
        attendedMeetings,
        noShowCount,
        hostedDinners,
        takeawayPortions,
      ] = await Promise.all([
        prisma.application.count({
          where: {
            userId,
            status: ApplicationStatus.ACCEPTED,
            guestConfirmedAt: { not: null },
            hostConfirmedAt: { not: null },
            hostMarkedNoShowAt: null,
            event: { format: EventFormat.IN_PERSON },
          },
        }),
        prisma.application.count({
          where: {
            userId,
            status: ApplicationStatus.ACCEPTED,
            hostMarkedNoShowAt: { not: null },
          },
        }),
        prisma.event.count({
          where: {
            hostId: userId,
            format: EventFormat.IN_PERSON,
            status: { not: 'CANCELLED' },
          },
        }),
        // Portions prepared = sum of accepted guest slots on takeaway events.
        prisma.event.aggregate({
          where: {
            hostId: userId,
            format: EventFormat.TAKEAWAY,
            status: { not: 'CANCELLED' },
          },
          _sum: { currentGuestsCount: true },
        }),
      ]);
      map.set(
        userId,
        withRatio({
          attendedMeetings,
          hostedDinners,
          takeawayOrdersPrepared: takeawayPortions._sum.currentGuestsCount ?? 0,
          noShowCount,
        }),
      );
    }),
  );

  return map;
}

export async function loadActivityFactsForUser(
  prisma: Db,
  userId: string,
): Promise<UserActivityFacts> {
  const map = await loadActivityFactsForUsers(prisma, [userId]);
  return map.get(userId) ?? { ...EMPTY };
}
