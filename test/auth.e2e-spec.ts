import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  randomPhone,
  registerAndLogin,
  getPrisma,
} from './utils/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a user and issues tokens on first verify-code (dev code 0000)', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone, code: '0000' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toBeDefined();
    expect(res.body.user.phone).toBe(phone);
  });

  it('rejects a wrong verification code', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone, code: '9999' })
      .expect(401);
  });

  it('rejects requests with no token on a protected route', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('rejects requests with a garbage token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('accepts a valid token on a protected route and returns the matching user', async () => {
    const { accessToken, userId } = await registerAndLogin(app);
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.id).toBe(userId);
  });

  it("rejects a blocked user's existing token immediately, and un-blocking restores access", async () => {
    const { accessToken, userId } = await registerAndLogin(app);
    const prisma = getPrisma(app);

    await prisma.user.update({
      where: { id: userId },
      data: { isBlocked: true },
    });
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    await prisma.user.update({
      where: { id: userId },
      data: { isBlocked: false },
    });
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rotates the refresh token and rejects the old one after refresh', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone, code: '0000' })
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // the old refresh token was rotated out and must no longer work
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
