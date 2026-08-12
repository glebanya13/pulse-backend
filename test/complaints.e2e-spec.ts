import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Complaints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('files a complaint about a user and it shows up in "mine"', async () => {
    const reporter = await registerAndLogin(app);
    const target = await registerAndLogin(app);

    const created = await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({
        targetType: 'USER',
        targetId: target.userId,
        reason: 'Хозяин не пустил на мероприятие',
      })
      .expect(201);
    expect(created.body.status).toBe('OPEN');

    const mine = await request(app.getHttpServer())
      .get('/api/v1/complaints/mine')
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .expect(200);
    expect(
      mine.body.some((c: { id: string }) => c.id === created.body.id),
    ).toBe(true);
  });

  it('files a SUPPORT request (general, not about a specific user/event) targeting self', async () => {
    const user = await registerAndLogin(app);

    const created = await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        targetType: 'SUPPORT',
        targetId: user.userId,
        reason: 'Не приходит SMS с кодом подтверждения',
      })
      .expect(201);
    expect(created.body.targetType).toBe('SUPPORT');

    const mine = await request(app.getHttpServer())
      .get('/api/v1/complaints/mine')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(created.body.id);
  });

  it('"mine" is per-user: does not leak another user\'s complaints', async () => {
    const userA = await registerAndLogin(app);
    const userB = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        targetType: 'SUPPORT',
        targetId: userA.userId,
        reason: 'Вопрос по оплате',
      })
      .expect(201);

    const mineB = await request(app.getHttpServer())
      .get('/api/v1/complaints/mine')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(mineB.body).toHaveLength(0);
  });

  it('rejects a reason that is too short', async () => {
    const user = await registerAndLogin(app);
    await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ targetType: 'SUPPORT', targetId: user.userId, reason: 'hi' })
      .expect(400);
  });
});
