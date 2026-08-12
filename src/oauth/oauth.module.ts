import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppleTokenService } from './apple-token.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseAuthController } from './firebase-auth.controller';
import { OAuthSessionService } from './oauth-session.service';
import { VkAuthController } from './vk-auth.controller';
import { YandexAuthController } from './yandex-auth.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [YandexAuthController, VkAuthController, FirebaseAuthController],
  providers: [OAuthSessionService, FirebaseAdminService, AppleTokenService],
  exports: [FirebaseAdminService, AppleTokenService],
})
export class OAuthModule {}
