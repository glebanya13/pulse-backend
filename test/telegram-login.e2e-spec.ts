import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

/**
 * The full "log in with Telegram" flow needs a real Telegram client sharing
 * a contact with the bot (see telegram-bot.service.ts's onText('/start')
 * handler) — that side is not automatable here and TELEGRAM_BOT_TOKEN is
 * deliberately empty in .env.test (see app.module.ts's comment on why).
 * What IS covered: the two REST endpoints behave correctly on their own —
 * refusing to start a session when the bot isn't configured, and correctly
 * reporting PENDING/EXPIRED/VERIFIED for a session regardless of how it got
 * into that state.
 */
describe('Telegram login (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses to start a session when the bot is not configured (TELEGRAM_BOT_TOKEN unset)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/telegram/start')
      .send({ phone: '+79001234567' })
      .expect(503);
  });

  it('rejects polling an unknown session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/telegram/status/00000000-0000-0000-0000-000000000000')
      .expect(400);
  });

  it('reports PENDING for a fresh, unexpired session', async () => {
    const prisma = getPrisma(app);
    const session = await prisma.telegramLoginSession.create({
      data: { phone: '+79001234567', expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/telegram/status/${session.id}`)
      .expect(200);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.accessToken).toBeUndefined();
  });

  it('reports and persists EXPIRED once past expiresAt', async () => {
    const prisma = getPrisma(app);
    const session = await prisma.telegramLoginSession.create({
      data: { phone: '+79001234567', expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/telegram/status/${session.id}`)
      .expect(200);
    expect(res.body.status).toBe('EXPIRED');

    const stored = await prisma.telegramLoginSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.status).toBe('EXPIRED');
  });

  it('returns tokens and the user once a session is VERIFIED', async () => {
    const { userId } = await registerAndLogin(app);
    const prisma = getPrisma(app);
    const session = await prisma.telegramLoginSession.create({
      data: {
        phone: '+79001234567',
        expiresAt: new Date(Date.now() + 60_000),
        status: 'VERIFIED',
        userId,
        accessToken: 'fake-access-for-test',
        refreshToken: 'fake-refresh-for-test',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/telegram/status/${session.id}`)
      .expect(200);
    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.accessToken).toBe('fake-access-for-test');
    expect(res.body.user.id).toBe(userId);
  });
});
