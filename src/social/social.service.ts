import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const AUTHOR_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  city: true,
} as const;

@Injectable()
export class SocialService {
  constructor(private prisma: PrismaService) {}

  private mapPost(
    post: {
      id: string;
      authorId: string;
      imageUrl: string;
      caption: string | null;
      createdAt: Date;
      placeId?: string | null;
      place?: {
        id: string;
        name: string;
        address: string | null;
        lat: number;
        lng: number;
        citySlug: string;
        ratingAvg: number;
        reviewsCount: number;
      } | null;
      author: { id: string; name: string; avatarUrl: string | null; city: string };
      likes: { userId: string }[];
      saves?: { userId: string }[];
      _count: { likes: number; comments: number };
    },
    viewerId?: string,
  ) {
    return {
      id: post.id,
      authorId: post.authorId,
      imageUrl: post.imageUrl,
      caption: post.caption,
      createdAt: post.createdAt.toISOString(),
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      likedByMe: viewerId
        ? post.likes.some((l) => l.userId === viewerId)
        : false,
      savedByMe: viewerId
        ? (post.saves ?? []).some((s) => s.userId === viewerId)
        : false,
      author: post.author,
      place: post.place ?? null,
    };
  }

  async listPosts(viewerId?: string, authorId?: string) {
    const posts = await this.prisma.post.findMany({
      where: authorId ? { authorId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { select: AUTHOR_SELECT },
        place: true,
        likes: viewerId
          ? { where: { userId: viewerId }, select: { userId: true } }
          : { take: 0 },
        saves: viewerId
          ? { where: { userId: viewerId }, select: { userId: true } }
          : { take: 0 },
        _count: { select: { likes: true, comments: true } },
      },
    });
    return posts.map((p) => this.mapPost(p, viewerId));
  }

  async createPost(
    authorId: string,
    data: { imageUrl: string; caption?: string; placeId?: string },
  ) {
    if (data.placeId) {
      const place = await this.prisma.place.findUnique({
        where: { id: data.placeId },
      });
      if (!place) throw new NotFoundException('Place not found');
    }
    const post = await this.prisma.post.create({
      data: {
        authorId,
        imageUrl: data.imageUrl,
        caption: data.caption?.trim() || null,
        placeId: data.placeId ?? null,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        place: true,
        likes: { take: 0 },
        saves: { take: 0 },
        _count: { select: { likes: true, comments: true } },
      },
    });
    return this.mapPost(post, authorId);
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this post');
    }
    await this.prisma.post.delete({ where: { id: postId } });
    return { deleted: true };
  }

  async likePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.postLike.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });
    const likesCount = await this.prisma.postLike.count({ where: { postId } });
    return { liked: true, likesCount };
  }

  async unlikePost(userId: string, postId: string) {
    await this.prisma.postLike.deleteMany({ where: { userId, postId } });
    const likesCount = await this.prisma.postLike.count({ where: { postId } });
    return { liked: false, likesCount };
  }

  async listComments(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    const comments = await this.prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { author: { select: AUTHOR_SELECT } },
    });
    return comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      text: c.text,
      createdAt: c.createdAt.toISOString(),
      author: c.author,
    }));
  }

  async addComment(userId: string, postId: string, text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 1) {
      throw new BadRequestException('Comment is empty');
    }
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    const comment = await this.prisma.postComment.create({
      data: { postId, authorId: userId, text: trimmed.slice(0, 2000) },
      include: { author: { select: AUTHOR_SELECT } },
    });
    const commentsCount = await this.prisma.postComment.count({
      where: { postId },
    });
    return {
      comment: {
        id: comment.id,
        postId: comment.postId,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        author: comment.author,
      },
      commentsCount,
    };
  }

  async savePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.postSave.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });
    return { saved: true };
  }

  async unsavePost(userId: string, postId: string) {
    await this.prisma.postSave.deleteMany({ where: { userId, postId } });
    return { saved: false };
  }

  async listSavedPosts(userId: string) {
    const rows = await this.prisma.postSave.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        post: {
          include: {
            author: { select: AUTHOR_SELECT },
            place: true,
            likes: { where: { userId }, select: { userId: true } },
            saves: { where: { userId }, select: { userId: true } },
            _count: { select: { likes: true, comments: true } },
          },
        },
      },
    });
    return rows.map((r) => this.mapPost(r.post, userId));
  }

  async storiesFeed(viewerId?: string) {
    const now = new Date();
    const stories = await this.prisma.story.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: AUTHOR_SELECT },
        place: true,
        views: viewerId
          ? { where: { userId: viewerId }, select: { userId: true } }
          : { take: 0 },
      },
    });

    const byAuthor = new Map<
      string,
      {
        author: (typeof stories)[0]['author'];
        items: {
          id: string;
          imageUrl: string;
          videoUrl: string | null;
          createdAt: string;
          expiresAt: string;
          seenByMe: boolean;
          place: {
            id: string;
            name: string;
            ratingAvg: number;
            reviewsCount: number;
          } | null;
        }[];
        hasUnseen: boolean;
      }
    >();

    for (const s of stories) {
      const seenByMe = viewerId
        ? s.views.some((v) => v.userId === viewerId)
        : false;
      const bucket = byAuthor.get(s.authorId) ?? {
        author: s.author,
        items: [],
        hasUnseen: false,
      };
      bucket.items.push({
        id: s.id,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl ?? null,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        seenByMe,
        place: s.place
          ? {
              id: s.place.id,
              name: s.place.name,
              ratingAvg: s.place.ratingAvg,
              reviewsCount: s.place.reviewsCount,
            }
          : null,
      });
      if (!seenByMe) bucket.hasUnseen = true;
      byAuthor.set(s.authorId, bucket);
    }

    // Own ring first (if any), then unseen, then seen.
    const groups = [...byAuthor.values()];
    groups.sort((a, b) => {
      const aMine = viewerId && a.author.id === viewerId ? 0 : 1;
      const bMine = viewerId && b.author.id === viewerId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return 0;
    });
    return groups;
  }

  async createStory(
    authorId: string,
    imageUrl: string,
    placeId?: string,
    videoUrl?: string,
  ) {
    if (placeId) {
      const place = await this.prisma.place.findUnique({ where: { id: placeId } });
      if (!place) throw new NotFoundException('Place not found');
    }
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const story = await this.prisma.story.create({
      data: {
        authorId,
        imageUrl,
        videoUrl: videoUrl?.trim() || null,
        createdAt,
        expiresAt,
        placeId: placeId ?? null,
      },
      include: { author: { select: AUTHOR_SELECT }, place: true },
    });
    return {
      id: story.id,
      imageUrl: story.imageUrl,
      videoUrl: story.videoUrl,
      createdAt: story.createdAt.toISOString(),
      expiresAt: story.expiresAt.toISOString(),
      author: story.author,
      place: story.place
        ? {
            id: story.place.id,
            name: story.place.name,
            ratingAvg: story.place.ratingAvg,
            reviewsCount: story.place.reviewsCount,
          }
        : null,
    };
  }

  async viewStory(userId: string, storyId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.expiresAt <= new Date()) {
      throw new NotFoundException('Story expired');
    }
    await this.prisma.storyView.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: { userId, storyId },
      update: {},
    });
    return { viewed: true };
  }
}
