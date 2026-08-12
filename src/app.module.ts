import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { ApplicationsModule } from './applications/applications.module';
import { RequestsModule } from './requests/requests.module';
import { ChatsModule } from './chats/chats.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { TelegramModule } from './telegram/telegram.module';
import { FavoritesModule } from './favorites/favorites.module';
import { PaymentsModule } from './payments/payments.module';
import { OAuthModule } from './oauth/oauth.module';
import { SocialModule } from './social/social.module';
import { MonetizationModule } from './monetization/monetization.module';
import { CitiesModule } from './cities/cities.module';
import { PlacesModule } from './places/places.module';

@Module({
  imports: [
    // NODE_ENV=test (see .env.test) loads an isolated env file instead of the
    // dev .env — otherwise e2e tests would inherit the real TELEGRAM_BOT_TOKEN
    // and start a second bot instance polling against the same token as the
    // locally-running dev server (409 Conflict), which also blocks the Nest
    // app from shutting down cleanly between test files.
    // Note: @prisma/client auto-loads the project-root .env on its own the
    // moment PrismaService instantiates PrismaClient, independent of this
    // ConfigModule — dotenv never overrides an already-set process.env key,
    // so .env.test must set every key it cares about to a real value
    // (including an explicit empty string for ones it wants left unset).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    // Skipped in e2e tests: both modules run background timers (throttler
    // storage cleanup, the cron scheduler) that outlive a single test file's
    // app.close() and leave Jest hanging on "did not exit" — and neither is
    // useful in tests anyway (the guard below is already skipped, and no
    // test wants a real cron job firing mid-suite).
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          // Generous global default (unrelated routes shouldn't ever hit it) —
          // the auth endpoints that actually need protection from SMS-code /
          // brute-force abuse override this with a much stricter @Throttle().
          ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
          ScheduleModule.forRoot(),
        ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    ApplicationsModule,
    RequestsModule,
    ChatsModule,
    ReviewsModule,
    NotificationsModule,
    AdminModule,
    ComplaintsModule,
    TelegramModule,
    FavoritesModule,
    PaymentsModule,
    OAuthModule,
    SocialModule,
    MonetizationModule,
    CitiesModule,
    PlacesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global auth guard: every route requires a valid JWT unless annotated @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Skipped in e2e tests: `registerAndLogin` is called dozens of times per
    // spec file within seconds, which would trip the auth-specific
    // @Throttle() limits below and make the suite flaky for reasons that
    // have nothing to do with what each test is actually checking.
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
  ],
})
export class AppModule {}
