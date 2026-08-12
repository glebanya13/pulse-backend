import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

/**
 * Same shape as telegram-login.e2e-spec.ts. The full OAuth roundtrip needs a
 * real Yandex/VK client id+secret (deliberately unset in .env.test — see
 * that file), so what's covered here is: start() correctly refuses when
 * unconfigured, status/:id reports PENDING/EXPIRED/VERIFIED regardless of
 * how the session got into that state, and callback's early-exit branches
 * (missing state, missing code/error param) work without needing real
 * provider credentials.
 */
describe('OAuth login — Yandex & VK (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  for (const provider of ['yandex', 'vk'] as const) {
    describe(provider, () => {
      it('refuses to start a session when client credentials are unset', async () => {
        await request(app.getHttpServer())
          .post(`/api/v1/auth/${provider}/start`)
          .expect(503);
      });

      it('rejects polling an unknown session', async () => {
        await request(app.getHttpServer())
          .get(
            `/api/v1/auth/${provider}/status/00000000-0000-0000-0000-000000000000`,
          )
          .expect(400);
      });

      it('reports PENDING for a fresh, unexpired session', async () => {
        const prisma = getPrisma(app);
        const session = await prisma.oAuthLoginSession.create({
          data: {
            provider: provider === 'yandex' ? 'YANDEX' : 'VK',
            expiresAt: new Date(Date.now() + 60_000),
          },
        });

        const res = await request(app.getHttpServer())
          .get(`/api/v1/auth/${provider}/status/${session.id}`)
          .expect(200);
        expect(res.body.status).toBe('PENDING');
        expect(res.body.accessToken).toBeUndefined();
      });

      it('reports and persists EXPIRED once past expiresAt', async () => {
        const prisma = getPrisma(app);
        const session = await prisma.oAuthLoginSession.create({
          data: {
            provider: provider === 'yandex' ? 'YANDEX' : 'VK',
            expiresAt: new Date(Date.now() - 1000),
          },
        });

        const res = await request(app.getHttpServer())
          .get(`/api/v1/auth/${provider}/status/${session.id}`)
          .expect(200);
        expect(res.body.status).toBe('EXPIRED');

        const stored = await prisma.oAuthLoginSession.findUniqueOrThrow({
          where: { id: session.id },
        });
        expect(stored.status).toBe('EXPIRED');
      });

      it('returns tokens and the user once a session is VERIFIED', async () => {
        const { userId } = await registerAndLogin(app);
        const prisma = getPrisma(app);
        const session = await prisma.oAuthLoginSession.create({
          data: {
            provider: provider === 'yandex' ? 'YANDEX' : 'VK',
            expiresAt: new Date(Date.now() + 60_000),
            status: 'VERIFIED',
            userId,
            accessToken: 'fake-access-for-test',
            refreshToken: 'fake-refresh-for-test',
          },
        });

        const res = await request(app.getHttpServer())
          .get(`/api/v1/auth/${provider}/status/${session.id}`)
          .expect(200);
        expect(res.body.status).toBe('VERIFIED');
        expect(res.body.accessToken).toBe('fake-access-for-test');
        expect(res.body.user.id).toBe(userId);
      });

      it('callback rejects a request with no session state', async () => {
        await request(app.getHttpServer())
          .get(`/api/v1/auth/${provider}/callback`)
          .expect(400);
      });

      it('callback marks the session EXPIRED when the provider reports an error / no code', async () => {
        const prisma = getPrisma(app);
        const session = await prisma.oAuthLoginSession.create({
          data: {
            provider: provider === 'yandex' ? 'YANDEX' : 'VK',
            expiresAt: new Date(Date.now() + 60_000),
          },
        });

        await request(app.getHttpServer())
          .get(`/api/v1/auth/${provider}/callback`)
          .query({ state: session.id, error: 'access_denied' })
          .expect(200);

        const stored = await prisma.oAuthLoginSession.findUniqueOrThrow({
          where: { id: session.id },
        });
        expect(stored.status).toBe('EXPIRED');
      });
    });
  }
});
