import { Injectable } from '@nestjs/common';
import { ReviewTargetRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type BadgeDef = {
  code: string;
  title: string;
  description: string;
  iconUrl: string;
};

/** Catalog kept in sync with product “геймификация рейтинга”. */
export const BADGE_CATALOG: BadgeDef[] = [
  {
    code: 'FIRST_EVENT',
    title: 'Первое событие',
    description: 'Провёл своё первое мероприятие',
    iconUrl: '🎉',
  },
  {
    code: 'TOP_HOST',
    title: 'Топ хозяин',
    description: 'Рейтинг 90+ при 5 и более отзывах',
    iconUrl: '👑',
  },
  {
    code: 'GUEST_FAVORITE',
    title: 'Любимец гостей',
    description: 'Рейтинг 95+ при 3 и более отзывах',
    iconUrl: '⭐',
  },
  {
    code: 'TASTE_MASTER',
    title: 'Мастер вкуса',
    description: 'Средний «вкус» 92+ по 3+ отзывам',
    iconUrl: '🍜',
  },
  {
    code: 'MASTER_COZY',
    title: 'Мастер уюта',
    description: 'Средняя атмосфера 90+ по 3+ отзывам',
    iconUrl: '🏠',
  },
  {
    code: 'WARM_WELCOME',
    title: 'Гостеприимный хозяин',
    description: 'Среднее гостеприимство 90+ по 3+ отзывам',
    iconUrl: '🤗',
  },
  {
    code: 'SOUL_OF_PARTY',
    title: 'Душа компании',
    description: 'Средняя общительность 90+ по 3+ отзывам',
    iconUrl: '🧑‍🤝‍🧑',
  },
  {
    code: 'VIBE_MASTER',
    title: 'Идеальный вайб',
    description: 'Средний вайб / уникальность 90+ по 3+ отзывам',
    iconUrl: '🍷',
  },
  {
    code: 'CLOCKWORK_HOST',
    title: 'Без хаоса',
    description: 'Средняя организация 90+ по 3+ отзывам',
    iconUrl: '⏱️',
  },
  {
    code: 'SPOTLESS_HOST',
    title: 'Кристальная кухня',
    description: 'Средняя чистота 90+ по 3+ отзывам',
    iconUrl: '✨',
  },
  {
    code: 'BORSCHT_KING',
    title: 'Король борща',
    description: 'Готовит борщ и получает высокий вкус',
    iconUrl: '👑',
  },
  {
    code: 'TOM_YUM_KING',
    title: 'Король том-яма',
    description: 'Готовит том-ям и получает высокий вкус',
    iconUrl: '👑',
  },
  {
    code: 'PUNCTUAL_GUEST',
    title: 'Пунктуальный гость',
    description: 'Средняя пунктуальность 90+ по 3+ отзывам как гостя',
    iconUrl: '⏰',
  },
  {
    code: 'POLITE_GUEST',
    title: 'Вежливый гость',
    description: 'Средняя вежливость 90+ по 3+ отзывам как гостя',
    iconUrl: '🙏',
  },
  {
    code: 'GREAT_GUEST',
    title: 'Желаемый гость',
    description: 'Рейтинг 90+ при 3 и более отзывах как гостя',
    iconUrl: '✨',
  },
  {
    code: 'SOUL_GUEST',
    title: 'Душа за столом',
    description: 'Средняя коммуникабельность 90+ по 3+ отзывам как гостя',
    iconUrl: '💬',
  },
  {
    code: 'AUTHOR_OF_MONTH',
    title: 'Автор месяца',
    description: 'Выбран командой «Пульс» автором месяца',
    iconUrl: '🏆',
  },
  {
    code: 'SPECIAL_PROJECT',
    title: 'Спецпроект',
    description: 'Участник гастрономического спецпроекта или коллаборации',
    iconUrl: '🎬',
  },
];

const DISH_BADGES: {
  code: string;
  keywords: string[];
}[] = [
  { code: 'BORSCHT_KING', keywords: ['борщ', 'borscht'] },
  {
    code: 'TOM_YUM_KING',
    keywords: ['том-ям', 'том ям', 'tomyum', 'tom yum', 'томям'],
  },
];

@Injectable()
export class BadgesService {
  constructor(private prisma: PrismaService) {}

  async ensureCatalog() {
    for (const b of BADGE_CATALOG) {
      await this.prisma.badge.upsert({
        where: { code: b.code },
        create: b,
        update: {
          title: b.title,
          description: b.description,
          iconUrl: b.iconUrl,
        },
      });
    }
  }

  private async award(userId: string, code: string) {
    const badge = await this.prisma.badge.findUnique({ where: { code } });
    if (!badge) return;
    await this.prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
      create: { userId, badgeId: badge.id },
      update: {},
    });
  }

  /** Public award helper for curated ops badges (author of month, special project). */
  async awardBadge(userId: string, code: string) {
    await this.ensureCatalog();
    await this.award(userId, code);
  }

  private avgCategory(
    reviews: { scores: unknown }[],
    key: string,
  ): number | null {
    const values: number[] = [];
    for (const r of reviews) {
      if (
        !r.scores ||
        typeof r.scores !== 'object' ||
        Array.isArray(r.scores)
      ) {
        continue;
      }
      const v = (r.scores as Record<string, unknown>)[key];
      if (typeof v === 'number') values.push(v);
    }
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private textMatches(haystack: string, keywords: string[]): boolean {
    const h = haystack.toLowerCase();
    return keywords.some((k) => h.includes(k.toLowerCase()));
  }

  /** Recompute and award host + guest badges for [userId]. */
  async evaluateForUser(userId: string) {
    await this.ensureCatalog();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        rating: true,
        hostRating: true,
        hostReviewsCount: true,
        guestRating: true,
        guestReviewsCount: true,
        reviewsCount: true,
        eventsCount: true,
      },
    });
    if (!user) return;

    if (user.eventsCount >= 1) {
      await this.award(userId, 'FIRST_EVENT');
    }
    if (user.hostRating >= 90 && user.hostReviewsCount >= 5) {
      await this.award(userId, 'TOP_HOST');
    }
    if (user.hostRating >= 95 && user.hostReviewsCount >= 3) {
      await this.award(userId, 'GUEST_FAVORITE');
    }

    const hostReviews = await this.prisma.review.findMany({
      where: { targetId: userId, targetRole: ReviewTargetRole.HOST },
      select: { scores: true, eventId: true },
    });
    if (hostReviews.length >= 3) {
      const taste = this.avgCategory(hostReviews, 'taste');
      const atmosphere = this.avgCategory(hostReviews, 'atmosphere');
      const hospitality = this.avgCategory(hostReviews, 'hospitality');
      const sociability = this.avgCategory(hostReviews, 'sociability');
      const vibe = this.avgCategory(hostReviews, 'vibe');
      const organization = this.avgCategory(hostReviews, 'organization');
      const cleanliness = this.avgCategory(hostReviews, 'cleanliness');

      if (taste != null && taste >= 92)
        await this.award(userId, 'TASTE_MASTER');
      if (atmosphere != null && atmosphere >= 90) {
        await this.award(userId, 'MASTER_COZY');
      }
      if (hospitality != null && hospitality >= 90) {
        await this.award(userId, 'WARM_WELCOME');
      }
      if (sociability != null && sociability >= 90) {
        await this.award(userId, 'SOUL_OF_PARTY');
      }
      if (vibe != null && vibe >= 90) await this.award(userId, 'VIBE_MASTER');
      if (organization != null && organization >= 90) {
        await this.award(userId, 'CLOCKWORK_HOST');
      }
      if (cleanliness != null && cleanliness >= 90) {
        await this.award(userId, 'SPOTLESS_HOST');
      }
    }

    // Dish titles: hosted events matching keywords + strong taste signal.
    const tasteAvg = this.avgCategory(hostReviews, 'taste');
    if (tasteAvg != null && tasteAvg >= 90 && hostReviews.length >= 2) {
      const hosted = await this.prisma.event.findMany({
        where: { hostId: userId },
        select: { title: true, tags: true },
      });
      for (const dish of DISH_BADGES) {
        const hasDish = hosted.some((e) => {
          const blob = `${e.title} ${e.tags.join(' ')}`;
          return this.textMatches(blob, dish.keywords);
        });
        if (hasDish) await this.award(userId, dish.code);
      }
    }

    const guestReviews = await this.prisma.review.findMany({
      where: { targetId: userId, targetRole: ReviewTargetRole.GUEST },
      select: { scores: true, overallScore: true },
    });
    if (guestReviews.length >= 3) {
      const punctuality = this.avgCategory(guestReviews, 'punctuality');
      const politeness = this.avgCategory(guestReviews, 'politeness');
      const communicability = this.avgCategory(guestReviews, 'communicability');
      if (punctuality != null && punctuality >= 90) {
        await this.award(userId, 'PUNCTUAL_GUEST');
      }
      if (politeness != null && politeness >= 90) {
        await this.award(userId, 'POLITE_GUEST');
      }
      if (communicability != null && communicability >= 90) {
        await this.award(userId, 'SOUL_GUEST');
      }
      const guestAvg =
        guestReviews.reduce((s, r) => s + r.overallScore, 0) /
        guestReviews.length;
      if (guestAvg >= 90) await this.award(userId, 'GREAT_GUEST');
    }
  }
}
