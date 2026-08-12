import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Event applications (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createEvent(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'IN_PERSON',
        title: 'Test dinner for e2e',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 1,
        ...overrides,
      })
      .expect(201);
    return res.body;
  }

  it('lets a guest apply, and blocks the host from applying to their own event', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const event = await createEvent(host.accessToken);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({ message: 'Can I come?' })
      .expect(201);
  });

  it('rejects a duplicate active application from the same guest', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const event = await createEvent(host.accessToken);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(409);
  });

  it('enforces maxGuests: accepting beyond capacity is rejected', async () => {
    const host = await registerAndLogin(app);
    const guestA = await registerAndLogin(app);
    const guestB = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, { maxGuests: 1 });

    const appA = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guestA.accessToken}`)
      .send({})
      .expect(201);
    const appB = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guestB.accessToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/applications/${appA.body.id}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    // capacity is now full (maxGuests=1, one accepted) — the second accept must fail
    await request(app.getHttpServer())
      .patch(`/api/v1/applications/${appB.body.id}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(403);
  });

  it('blocks applying to an event whose start time has already passed', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    // startAt in the past — EventsService derives this as COMPLETED at read time
    const event = await createEvent(host.accessToken, {
      startAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(400);
  });

  it('excludes past events from the public browse list', async () => {
    const host = await registerAndLogin(app);
    const pastEvent = await createEvent(host.accessToken, {
      title: 'Past event should not appear in browse',
      startAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    const someone = await registerAndLogin(app);
    const res = await request(app.getHttpServer())
      .get('/api/v1/events?limit=100')
      .set('Authorization', `Bearer ${someone.accessToken}`)
      .expect(200);
    const ids = (res.body.items as Array<{ id: string }>).map((e) => e.id);
    expect(ids).not.toContain(pastEvent.id);
  });

  it('lists pending hosted applications and returns chatId on accept', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, {
      maxGuests: 4,
      minGuests: 2,
    });

    const application = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(201);

    const pending = await request(app.getHttpServer())
      .get('/api/v1/users/me/hosted-applications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(
      pending.body.items.some((a: { id: string }) => a.id === application.body.id),
    ).toBe(true);

    const accepted = await request(app.getHttpServer())
      .patch(`/api/v1/applications/${application.body.id}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(accepted.body.chatId).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(detail.body.currentGuestsCount).toBe(1);
    expect(detail.body.chatId).toBe(accepted.body.chatId);

    const pendingAfter = await request(app.getHttpServer())
      .get('/api/v1/users/me/hosted-applications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(
      pendingAfter.body.items.some(
        (a: { id: string }) => a.id === application.body.id,
      ),
    ).toBe(false);
  });
});
