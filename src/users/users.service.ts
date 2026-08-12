import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR } from '../common/upload.config';
import { AppleTokenService } from '../oauth/apple-token.service';
import { FirebaseAdminService } from '../oauth/firebase-admin.service';
import { sanitizeSocialLinks, UpdateUserDto } from './dto/update-user.dto';
import { loadActivityFactsForUser } from './user-activity';
import { loadAuthorPathForUser } from './author-path';
import {
  authorMonthPeriod,
  formatAuthorMonthPeriodRu,
} from './author-month';

function unlinkLocalUpload(url: string | null | undefined) {
  if (!url?.startsWith('/uploads/')) return;
  const filePath = join(UPLOADS_DIR, url.replace('/uploads/', ''));
  if (!existsSync(filePath)) return;
  try {
    unlinkSync(filePath);
  } catch {
    // Best-effort — leftover files must not block account deletion.
  }
}

const PUBLIC_PROFILE_SELECT = {
  id: true,
  name: true,
  age: true,
  city: true,
  avatarUrl: true,
  bio: true,
  whatICook: true,
  socialLinks: true,
  photos: true,
  rating: true,
  hostRating: true,
  hostReviewsCount: true,
  guestRating: true,
  guestReviewsCount: true,
  eventsCount: true,
  reviewsCount: true,
  authorLevel: true,
  authorOfMonthPeriod: true,
  specialProject: true,
  organizerProUntil: true,
  memberSince: true,
  badges: { include: { badge: true } },
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private appleTokens: AppleTokenService,
    private firebase: FirebaseAdminService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { badges: { include: { badge: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const [followersCount, followingCount, activity, authorPath] =
      await Promise.all([
        this.prisma.userFollow.count({ where: { followingId: userId } }),
        this.prisma.userFollow.count({ where: { followerId: userId } }),
        loadActivityFactsForUser(this.prisma, userId),
        loadAuthorPathForUser(this.prisma, userId, {
          hostRating: user.hostRating,
          hostReviewsCount: user.hostReviewsCount,
          eventsCount: user.eventsCount,
        }),
      ]);
    const isOrganizerPro = !!(
      user.organizerProUntil && user.organizerProUntil.getTime() > Date.now()
    );
    return { ...user, followersCount, followingCount, activity, authorPath, isOrganizerPro };
  }

  /** Self-serve: USER → PERFORMER so they can publish nightlife events. */
  async becomeOrganizer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.PERFORMER && user.role !== Role.ADMIN) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: Role.PERFORMER },
      });
    }
    return this.me(userId);
  }

  async update(userId: string, dto: UpdateUserDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.age !== undefined) data.age = dto.age;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.whatICook !== undefined) data.whatICook = dto.whatICook;
    if (dto.socialLinks !== undefined) {
      const cleaned = sanitizeSocialLinks(dto.socialLinks);
      data.socialLinks = cleaned === null ? Prisma.DbNull : cleaned;
    }
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async setFcmToken(userId: string, token: string | null) {
    const cleaned = token?.trim() || null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: cleaned },
    });
    return { success: true };
  }

  async publicProfile(id: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    let isFollowing = false;
    let isBlockedByMe = false;
    if (viewerId && viewerId !== id) {
      const [followRow, blockRow] = await Promise.all([
        this.prisma.userFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: id,
            },
          },
        }),
        this.prisma.userBlock.findUnique({
          where: {
            blockerId_blockedId: { blockerId: viewerId, blockedId: id },
          },
        }),
      ]);
      isFollowing = !!followRow;
      isBlockedByMe = !!blockRow;
    }

    const [followersCount, followingCount, activity, authorPath] =
      await Promise.all([
        this.prisma.userFollow.count({ where: { followingId: id } }),
        this.prisma.userFollow.count({ where: { followerId: id } }),
        loadActivityFactsForUser(this.prisma, id),
        loadAuthorPathForUser(this.prisma, id, {
          hostRating: user.hostRating,
          hostReviewsCount: user.hostReviewsCount,
        }),
      ]);

    return {
      ...user,
      isFollowing,
      isBlockedByMe,
      followersCount,
      followingCount,
      activity,
      authorPath,
      isOrganizerPro: !!(
        user.organizerProUntil && user.organizerProUntil.getTime() > Date.now()
      ),
    };
  }

  /** Public showcase: current curated author of the month (or null). */
  async authorOfMonthShowcase() {
    const period = authorMonthPeriod();
    const row = await this.prisma.authorOfMonth.findUnique({
      where: { period },
      include: {
        user: {
          select: {
            ...PUBLIC_PROFILE_SELECT,
            whatICook: true,
          },
        },
      },
    });
    if (!row) {
      return { period, periodLabel: formatAuthorMonthPeriodRu(period), author: null };
    }
    return {
      period,
      periodLabel: formatAuthorMonthPeriodRu(period),
      note: row.note,
      author: row.user,
    };
  }

  /** People who follow this user. */
  async listFollowers(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const rows = await this.prisma.userFollow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        follower: { select: PUBLIC_PROFILE_SELECT },
      },
    });
    return {
      items: rows.map((r) => r.follower),
    };
  }

  /** People this user follows. */
  async listFollowing(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const rows = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        following: { select: PUBLIC_PROFILE_SELECT },
      },
    });
    return {
      items: rows.map((r) => r.following),
    };
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Нельзя подписаться на себя');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, isBlocked: true },
    });
    if (!target || target.isBlocked) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.userFollow.upsert({
      where: {
        followerId_followingId: { followerId, followingId },
      },
      create: { followerId, followingId },
      update: {},
    });

    return { success: true, isFollowing: true };
  }

  async unfollow(followerId: string, followingId: string) {
    await this.prisma.userFollow.deleteMany({
      where: { followerId, followingId },
    });
    return { success: true, isFollowing: false };
  }

  /**
   * Blocking is one-directional in storage but symmetric in effect: the
   * feed filters (events/requests) hide content in both directions, so the
   * blocked user also stops seeing the blocker's content immediately.
   */
  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      // A block implies unfollow in both directions — you shouldn't keep
      // seeing someone in your "following" list after blocking them.
      this.prisma.userFollow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      }),
    ]);

    return { success: true, isBlockedByMe: true };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });
    return { success: true, isBlockedByMe: false };
  }

  /** Ids of users to exclude from this viewer's feeds — either direction. */
  async blockedUserIdsFor(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) =>
      r.blockerId === userId ? r.blockedId : r.blockerId,
    );
  }

  async addPhotoUrls(userId: string, urls: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { photos: { push: urls } },
    });
  }

  /** Also clears avatarUrl if that's the photo being removed, and deletes the
   *  underlying file when it's one of ours (a local /uploads/* path) —
   *  never touches externally-hosted URLs (e.g. seed data's picsum links). */
  async removePhotoUrl(userId: string, url: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        photos: user.photos.filter((p) => p !== url),
        avatarUrl: user.avatarUrl === url ? null : user.avatarUrl,
      },
    });

    unlinkLocalUpload(url);
    return updated;
  }

  /**
   * Permanently deletes the account and cascaded user data (events, chats,
   * reviews, etc.). Required for App Store Guideline 5.1.1(v).
   */
  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // App Store 5.1.1(v): revoke Sign in with Apple before wiping the row.
    if (user.appleRefreshToken) {
      await this.appleTokens.revokeRefreshToken(user.appleRefreshToken);
    } else if (user.appleId) {
      this.logger.warn(
        `Account ${userId} has appleId but no appleRefreshToken — Apple revoke skipped (configure APPLE_* keys and re-login)`,
      );
    }

    if (user.firebaseUid) {
      await this.firebase.deleteUser(user.firebaseUid);
    }

    const uploads = new Set<string>([
      ...user.photos,
      ...(user.avatarUrl ? [user.avatarUrl] : []),
    ]);

    await this.prisma.$transaction(async (tx) => {
      // MessageRead has no User FK — must be cleared manually.
      await tx.messageRead.deleteMany({ where: { userId } });
      await tx.authCode.deleteMany({ where: { phone: user.phone } });
      await tx.telegramLoginSession.deleteMany({ where: { userId } });
      await tx.oAuthLoginSession.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    for (const url of uploads) {
      unlinkLocalUpload(url);
    }
  }
}
