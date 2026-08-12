import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Favorites (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createEvent(token: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'IN_PERSON',
        title: 'Favorites test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);
    return res.body.id;
  }

  it('adds, lists, and removes a favorite; isFavorite reflects on the event itself', async () => {
    const host = await registerAndLogin(app);
    const user = await registerAndLogin(app);
    const eventId = await createEvent(host.accessToken);

    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${eventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(list.body.some((e: { id: string }) => e.id === eventId)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(detail.body.isFavorite).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/favorites/${eventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const listAfter = await request(app.getHttpServer())
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(listAfter.body.some((e: { id: string }) => e.id === eventId)).toBe(
      false,
    );
  });

  it('is idempotent: favoriting twice does not create duplicates or error', async () => {
    const host = await registerAndLogin(app);
    const user = await registerAndLogin(app);
    const eventId = await createEvent(host.accessToken);

    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${eventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${eventId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(
      list.body.filter((e: { id: string }) => e.id === eventId).length,
    ).toBe(1);
  });

  it('favorites are per-user: one user favoriting an event does not affect another', async () => {
    const host = await registerAndLogin(app);
    const userA = await registerAndLogin(app);
    const userB = await registerAndLogin(app);
    const eventId = await createEvent(host.accessToken);

    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${eventId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(201);

    const detailForB = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(detailForB.body.isFavorite).toBe(false);
  });
});
