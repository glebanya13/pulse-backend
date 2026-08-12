import { ApplicationStatus, PrismaClient } from '@prisma/client';

/** Criterion / achievement badges that count for author level 4 (not FIRST_EVENT). */
export const AUTHOR_PATH_CRITERION_BADGES = new Set([
  'TASTE_MASTER',
  'MASTER_COZY',
  'WARM_WELCOME',
  'SOUL_OF_PARTY',
  'VIBE_MASTER',
  'CLOCKWORK_HOST',
  'SPOTLESS_HOST',
  'BORSCHT_KING',
  'TOM_YUM_KING',
  'TOP_HOST',
  'GUEST_FAVORITE',
]);

/** Events from hosts at this level+ get feed boost / «Таланты» filter. */
export const AUTHOR_TALENT_MIN_LEVEL = 5;

export type AuthorPathLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type AuthorPathNext = {
  level: AuthorPathLevel;
  title: string;
  /** Short goal copy, e.g. «Ещё 3 гостя». */
  hint: string;
  /** 0–1 progress toward this next level. */
  progress: number;
};

export type AuthorPath = {
  level: AuthorPathLevel;
  title: string;
  eventsHosted: number;
  guestsHosted: number;
  hostReviewsCount: number;
  hostRating: number;
  hasCriterionBadge: boolean;
  next: AuthorPathNext | null;
};

export const AUTHOR_LEVEL_TITLES: Record<AuthorPathLevel, string> = {
  0: 'Новичок',
  1: 'Первый стол',
  2: 'Собирает стол',
  3: 'Есть голос',
  4: 'С характером',
  5: 'Домашний шеф',
  6: 'Автор Пульс',
};

type Db = Pick<
  PrismaClient,
  'application' | 'event' | 'userBadge' | 'badge' | 'user'
>;

function clamp01(n: number) {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return Math.round(n * 1000) / 1000;
}

function nextGoal(
  level: AuthorPathLevel,
  s: {
    eventsHosted: number;
    guestsHosted: number;
    hostReviewsCount: number;
    hostRating: number;
    hasCriterionBadge: boolean;
  },
): AuthorPathNext | null {
  if (level >= 6) return null;
  const nextLevel = (level + 1) as AuthorPathLevel;
  switch (nextLevel) {
    case 1: {
      const target = 1;
      return {
        level: 1,
        title: AUTHOR_LEVEL_TITLES[1],
        hint:
          s.eventsHosted >= 1
            ? 'Создайте событие'
            : 'Создайте своё первое событие',
        progress: clamp01(s.eventsHosted / target),
      };
    }
    case 2: {
      const target = 10;
      const left = Math.max(0, target - s.guestsHosted);
      return {
        level: 2,
        title: AUTHOR_LEVEL_TITLES[2],
        hint:
          left === 0
            ? 'Примите ещё гостей'
            : `Ещё ${left} ${guestWord(left)} до уровня`,
        progress: clamp01(s.guestsHosted / target),
      };
    }
    case 3: {
      const target = 10;
      const left = Math.max(0, target - s.hostReviewsCount);
      return {
        level: 3,
        title: AUTHOR_LEVEL_TITLES[3],
        hint:
          left === 0
            ? 'Соберите отзывы гостей'
            : `Ещё ${left} ${reviewWord(left)} как хозяину`,
        progress: clamp01(s.hostReviewsCount / target),
      };
    }
    case 4:
      return {
        level: 4,
        title: AUTHOR_LEVEL_TITLES[4],
        hint: s.hasCriterionBadge
          ? 'Получите медаль за вкус, уют или вайб'
          : 'Получите первую медаль за критерии (вкус, уют, вайб…)',
        progress: s.hasCriterionBadge ? 1 : 0,
      };
    case 5: {
      const target = 50;
      const left = Math.max(0, target - s.guestsHosted);
      return {
        level: 5,
        title: AUTHOR_LEVEL_TITLES[5],
        hint:
          left === 0
            ? 'Примите 50 гостей'
            : `Ещё ${left} ${guestWord(left)} до «Домашний шеф»`,
        progress: clamp01(s.guestsHosted / target),
      };
    }
    case 6: {
      const guestsTarget = 100;
      const ratingOk = s.hostRating >= 85 && s.hostReviewsCount >= 10;
      const guestsProgress = clamp01(s.guestsHosted / guestsTarget);
      const left = Math.max(0, guestsTarget - s.guestsHosted);
      let hint: string;
      if (left > 0) {
        hint = `Ещё ${left} ${guestWord(left)} и рейтинг хоста 85+`;
      } else if (!ratingOk) {
        hint = 'Нужен host-рейтинг 85+ при 10+ отзывах';
      } else {
        hint = 'Почти у цели';
      }
      return {
        level: 6,
        title: AUTHOR_LEVEL_TITLES[6],
        hint,
        progress: clamp01(guestsProgress * 0.7 + (ratingOk ? 0.3 : 0)),
      };
    }
    default:
      return null;
  }
}

function guestWord(n: number) {
  const m = n % 100;
  const m1 = m % 10;
  if (m > 10 && m < 20) return 'гостей';
  if (m1 === 1) return 'гость';
  if (m1 >= 2 && m1 <= 4) return 'гостя';
  return 'гостей';
}

function reviewWord(n: number) {
  const m = n % 100;
  const m1 = m % 10;
  if (m > 10 && m < 20) return 'отзывов';
  if (m1 === 1) return 'отзыв';
  if (m1 >= 2 && m1 <= 4) return 'отзыва';
  return 'отзывов';
}

export function computeAuthorPath(input: {
  eventsHosted: number;
  guestsHosted: number;
  hostReviewsCount: number;
  hostRating: number;
  hasCriterionBadge: boolean;
}): AuthorPath {
  const {
    eventsHosted,
    guestsHosted,
    hostReviewsCount,
    hostRating,
    hasCriterionBadge,
  } = input;

  let level: AuthorPathLevel = 0;
  if (eventsHosted >= 1) level = 1;
  if (level >= 1 && guestsHosted >= 10) level = 2;
  if (level >= 2 && hostReviewsCount >= 10) level = 3;
  if (level >= 3 && hasCriterionBadge) level = 4;
  if (level >= 4 && guestsHosted >= 50) level = 5;
  if (
    level >= 5 &&
    guestsHosted >= 100 &&
    hostRating >= 85 &&
    hostReviewsCount >= 10
  ) {
    level = 6;
  }

  return {
    level,
    title: AUTHOR_LEVEL_TITLES[level],
    eventsHosted,
    guestsHosted,
    hostReviewsCount,
    hostRating,
    hasCriterionBadge,
    next: nextGoal(level, input),
  };
}

/** Load path stats and compute level for a host. */
export async function loadAuthorPathForUser(
  prisma: Db,
  userId: string,
  cached?: {
    hostRating?: number;
    hostReviewsCount?: number;
    eventsCount?: number;
  },
): Promise<AuthorPath> {
  const [eventsHosted, guestsHosted, badgeRows, userRow] = await Promise.all([
    prisma.event.count({
      where: { hostId: userId, status: { not: 'CANCELLED' } },
    }),
    prisma.application.count({
      where: {
        status: ApplicationStatus.ACCEPTED,
        event: { hostId: userId, status: { not: 'CANCELLED' } },
      },
    }),
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { code: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        authorLevel: true,
        hostRating: true,
        hostReviewsCount: true,
      },
    }),
  ]);

  const hasCriterionBadge = badgeRows.some((r) =>
    AUTHOR_PATH_CRITERION_BADGES.has(r.badge.code),
  );

  const hostRating = cached?.hostRating ?? userRow?.hostRating ?? 100;
  const hostReviewsCount =
    cached?.hostReviewsCount ?? userRow?.hostReviewsCount ?? 0;

  const path = computeAuthorPath({
    eventsHosted,
    guestsHosted,
    hostReviewsCount,
    hostRating,
    hasCriterionBadge,
  });

  // Keep cache warm for feed filters (silent — no level-up push).
  if (userRow && userRow.authorLevel !== path.level) {
    await prisma.user.update({
      where: { id: userId },
      data: { authorLevel: path.level },
    });
  }

  return path;
}

export type AuthorLevelUpInfo = {
  from: AuthorPathLevel;
  to: AuthorPathLevel;
  title: string;
};

/**
 * Recompute path, persist `User.authorLevel`, and optionally notify on climb.
 */
export async function syncAuthorLevelForUser(
  prisma: Db,
  userId: string,
  options?: {
    onLevelUp?: (info: AuthorLevelUpInfo) => Promise<void>;
  },
): Promise<AuthorPath> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      authorLevel: true,
      hostRating: true,
      hostReviewsCount: true,
    },
  });
  if (!user) {
    return computeAuthorPath({
      eventsHosted: 0,
      guestsHosted: 0,
      hostReviewsCount: 0,
      hostRating: 100,
      hasCriterionBadge: false,
    });
  }

  const prevLevel = Math.min(
    6,
    Math.max(0, user.authorLevel),
  ) as AuthorPathLevel;

  // Compute without the silent cache write inside load — we handle notify here.
  const [eventsHosted, guestsHosted, badgeRows] = await Promise.all([
    prisma.event.count({
      where: { hostId: userId, status: { not: 'CANCELLED' } },
    }),
    prisma.application.count({
      where: {
        status: ApplicationStatus.ACCEPTED,
        event: { hostId: userId, status: { not: 'CANCELLED' } },
      },
    }),
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { code: true } } },
    }),
  ]);

  const path = computeAuthorPath({
    eventsHosted,
    guestsHosted,
    hostReviewsCount: user.hostReviewsCount,
    hostRating: user.hostRating,
    hasCriterionBadge: badgeRows.some((r) =>
      AUTHOR_PATH_CRITERION_BADGES.has(r.badge.code),
    ),
  });

  if (path.level !== prevLevel) {
    await prisma.user.update({
      where: { id: userId },
      data: { authorLevel: path.level },
    });
  }

  if (path.level > prevLevel && options?.onLevelUp) {
    await options.onLevelUp({
      from: prevLevel,
      to: path.level,
      title: path.title,
    });
  }

  return path;
}

export function authorLevelUpCopy(level: number, title: string) {
  const body =
    level >= AUTHOR_TALENT_MIN_LEVEL
      ? `Вы — «${title}». Ваши события выше в ленте «Таланты».`
      : `Вы — «${title}». Так держать!`;
  return { title: 'Новый уровень автора', body };
}

/** One-shot cache warm for hosts with non-cancelled events. */
export async function backfillAuthorLevels(prisma: Db): Promise<number> {
  const hosts = await prisma.event.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { hostId: true },
    distinct: ['hostId'],
  });
  for (const h of hosts) {
    await syncAuthorLevelForUser(prisma, h.hostId);
  }
  return hosts.length;
}
