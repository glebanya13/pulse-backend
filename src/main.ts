import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './common/upload.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });
  // Fixed demo photos for prisma/seed.ts — bundled into the image (unlike
  // /uploads, which is user-generated and .dockerignore'd), so seed data
  // doesn't depend on an external image host that may be unreachable from
  // some networks (picsum.photos redirects to fastly.picsum.photos, which
  // was observed failing to load entirely on a real device).
  app.useStaticAssets(join(process.cwd(), 'seed-assets'), {
    prefix: '/seed-assets/',
  });
  // Legal pages for App Store / Play (privacy policy URL, support URL).
  app.useStaticAssets(join(process.cwd(), 'public'));

  app.enableCors();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Пульс API')
    .setDescription(
      'API for «Пульс» — афиша тусовок, концертов и мероприятий (Минск)',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `Пульс API listening on http://localhost:${port}/api/v1 (docs at /api/docs)`,
  );

  // Warm authorLevel cache for talent feed (fire-and-forget).
  try {
    const { PrismaService } = await import('./prisma/prisma.service');
    const { backfillAuthorLevels } = await import('./users/author-path');
    const prisma = app.get(PrismaService);
    void backfillAuthorLevels(prisma).then((n) => {
      // eslint-disable-next-line no-console
      console.log(`authorLevel backfill done for ${n} hosts`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('authorLevel backfill skipped', err);
  }
}
bootstrap();
