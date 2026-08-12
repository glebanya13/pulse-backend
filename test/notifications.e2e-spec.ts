import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Notifications (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an APPLICATION_RECEIVED notification for the host when a guest applies, and it can be marked read', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({
        format: 'IN_PERSON',
        title: 'Notification test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.body.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    const notification = list.body.items.find(
      (n: { type: string }) => n.type === 'APPLICATION_RECEIVED',
    );
    expect(notification).toBeDefined();
    expect(notification.isRead).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(
      after.body.items.find((n: { id: string }) => n.id === notification.id)
        .isRead,
    ).toBe(true);
  });

  it('mark-all-read clears every unread notification for that user', async () => {
    const host = await registerAndLogin(app);
    const guestA = await registerAndLogin(app);
    const guestB = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({
        format: 'IN_PERSON',
        title: 'Mark all read test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);

    for (const guest of [guestA, guestB]) {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${event.body.id}/applications`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .send({})
        .expect(201);
    }

    await request(app.getHttpServer())
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(after.body.items.every((n: { isRead: boolean }) => n.isRead)).toBe(
      true,
    );
  });

  it("rejects marking another user's notification as read", async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({
        format: 'IN_PERSON',
        title: 'Cross-user notification test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.body.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    const notification = list.body.items.find(
      (n: { type: string }) => n.type === 'APPLICATION_RECEIVED',
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);
  });
});
