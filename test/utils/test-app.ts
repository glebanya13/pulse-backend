import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  await app.init();
  return app;
}

/** Unique per call so parallel test files never collide on the same phone number. */
export function randomPhone(): string {
  const digits = Math.floor(1000000 + Math.random() * 8999999);
  return `+7900${digits}`;
}

/** Runs the real request-code + verify-code flow (dev code "0000") and returns the issued tokens + user id. */
export async function registerAndLogin(
  app: INestApplication,
  phone = randomPhone(),
): Promise<{ accessToken: string; userId: string; phone: string }> {
  await request(app.getHttpServer())
    .post('/api/v1/auth/request-code')
    .send({ phone })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/verify-code')
    .send({ phone, code: '0000' })
    .expect(201);
  return { accessToken: res.body.accessToken, userId: res.body.user.id, phone };
}

export function getPrisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}
