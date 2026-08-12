import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * RefreshToken rows are never deleted elsewhere (refresh() only flips
 * `revoked`), so the table grows forever without this — every login and
 * every refresh adds a row that's useless the moment it's revoked or its
 * expiresAt passes.
 */
@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ revoked: true }, { expiresAt: { lt: new Date() } }] },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} stale refresh token(s).`);
    }
  }
}
