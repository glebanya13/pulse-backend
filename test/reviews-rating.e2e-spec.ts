import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

describe('Reviews + rating calculation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createEvent(
    token: string,
    startAt: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'IN_PERSON',
        title: 'Reviewable dinner',
        startAt,
        priceType: 'FREE',
        maxGuests: 4,
        ...overrides,
      })
      .expect(201);
    return res.body;
  }

  const future = () =>
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it('blocks a review while the event has not happened yet', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, future());

    const applied = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/applications/${applied.body.id}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 90 },
      })
      .expect(400);
  });

  it('rejects a self-review', async () => {
    const host = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, past());

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 90 },
      })
      .expect(400);
  });

  it('rejects a review from someone who never participated in the event', async () => {
    const host = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, past());

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 90 },
      })
      .expect(403);
  });

  it('accepts a review after the event has passed, rejects a duplicate, and recomputes the target rating', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, past());
    const prisma = getPrisma(app);

    // seed an accepted application directly — apply() itself blocks applying
    // to a past event, but a guest who applied *before* it started and was
    // accepted must still be able to review it afterwards.
    await prisma.application.create({
      data: { eventId: event.id, userId: guest.userId, status: 'ACCEPTED' },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 80, atmosphere: 100 },
        comment: 'Great host',
      })
      .expect(400); // mutual attendance not confirmed yet

    const appRow = await prisma.application.findFirstOrThrow({
      where: { eventId: event.id, userId: guest.userId },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/applications/${appRow.id}/confirm-attendance`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/applications/${appRow.id}/confirm-attendance`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(201);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: host.userId },
    });
    expect(before.reviewsCount).toBe(0);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 80, atmosphere: 100 },
        comment: 'Great host',
      })
      .expect(201);
    // Weighted: taste 25% + atmosphere 15% → renormalize → 87.5 → 88
    expect(created.body.overallScore).toBe(88);

    // never trust the client for aggregate fields — reviewsCount/rating are
    // recomputed server-side from the Review table, not taken from the request
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: host.userId },
    });
    expect(after.reviewsCount).toBe(1);
    expect(after.rating).toBe(88);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 50 },
      })
      .expect(409);
  });

  it('blocks a review for a cancelled event', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const event = await createEvent(host.accessToken, future());
    const prisma = getPrisma(app);

    await prisma.application.create({
      data: { eventId: event.id, userId: guest.userId, status: 'ACCEPTED' },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { status: 'CANCELLED' },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 90 },
      })
      .expect(400);
  });
});
