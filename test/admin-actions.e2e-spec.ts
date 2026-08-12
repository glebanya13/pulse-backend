import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

describe('Admin actions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeAdmin() {
    const admin = await registerAndLogin(app);
    const prisma = getPrisma(app);
    await prisma.user.update({
      where: { id: admin.userId },
      data: { role: 'ADMIN' },
    });
    return { ...admin, H: { Authorization: `Bearer ${admin.accessToken}` } };
  }

  it('blocks and unblocks a user, and logs both actions', async () => {
    const admin = await makeAdmin();
    const target = await registerAndLogin(app);

    const blocked = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.userId}/block`)
      .set(admin.H)
      .send({ isBlocked: true })
      .expect(200);
    expect(blocked.body.isBlocked).toBe(true);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set({ Authorization: `Bearer ${target.accessToken}` })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.userId}/block`)
      .set(admin.H)
      .send({ isBlocked: false })
      .expect(200);

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/logs')
      .set(admin.H)
      .expect(200);
    const actions = logs.body.items
      .filter((l: { targetId: string }) => l.targetId === target.userId)
      .map((l: { action: string }) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['BLOCK_USER', 'UNBLOCK_USER']),
    );
  });

  it('cancels any event regardless of host, and logs it', async () => {
    const admin = await makeAdmin();
    const host = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set({ Authorization: `Bearer ${host.accessToken}` })
      .send({
        format: 'IN_PERSON',
        title: 'Admin cancel test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .patch(`/api/v1/admin/events/${event.body.id}/cancel`)
      .set(admin.H)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/logs')
      .set(admin.H)
      .expect(200);
    expect(
      logs.body.items.some(
        (l: { action: string; targetId: string }) =>
          l.action === 'CANCEL_EVENT' && l.targetId === event.body.id,
      ),
    ).toBe(true);
  });

  it('resolves a complaint filed by a user, and logs it', async () => {
    const admin = await makeAdmin();
    const reporter = await registerAndLogin(app);
    const host = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set({ Authorization: `Bearer ${host.accessToken}` })
      .send({
        format: 'IN_PERSON',
        title: 'Complaint test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);

    const complaint = await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        targetType: 'EVENT',
        targetId: event.body.id,
        reason: 'Хозяин не отвечает на сообщения',
      })
      .expect(201);
    expect(complaint.body.status).toBe('OPEN');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/complaints')
      .set(admin.H)
      .expect(200);
    expect(
      listed.body.items.some((c: { id: string }) => c.id === complaint.body.id),
    ).toBe(true);

    const resolved = await request(app.getHttpServer())
      .patch(`/api/v1/admin/complaints/${complaint.body.id}`)
      .set(admin.H)
      .send({ status: 'RESOLVED' })
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/logs')
      .set(admin.H)
      .expect(200);
    expect(
      logs.body.items.some(
        (l: { action: string; targetId: string }) =>
          l.action === 'RESOLVE_COMPLAINT' && l.targetId === complaint.body.id,
      ),
    ).toBe(true);
  });

  it('deletes an inappropriate review and recomputes the target rating', async () => {
    const admin = await makeAdmin();
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const prisma = getPrisma(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set({ Authorization: `Bearer ${host.accessToken}` })
      .send({
        format: 'IN_PERSON',
        title: 'Review delete test dinner',
        startAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);
    await prisma.application.create({
      data: {
        eventId: event.body.id,
        userId: guest.userId,
        status: 'ACCEPTED',
        guestConfirmedAt: new Date(),
        hostConfirmedAt: new Date(),
      },
    });

    const review = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.body.id}/reviews`)
      .set({ Authorization: `Bearer ${guest.accessToken}` })
      .send({
        targetId: host.userId,
        targetRole: 'HOST',
        scores: { taste: 10 },
        comment: 'unfair',
      })
      .expect(201);

    const afterReview = await prisma.user.findUniqueOrThrow({
      where: { id: host.userId },
    });
    expect(afterReview.reviewsCount).toBe(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/reviews/${review.body.id}`)
      .set(admin.H)
      .expect(200);

    const afterDelete = await prisma.user.findUniqueOrThrow({
      where: { id: host.userId },
    });
    expect(afterDelete.reviewsCount).toBe(0);

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/logs')
      .set(admin.H)
      .expect(200);
    expect(
      logs.body.items.some(
        (l: { action: string; targetId: string }) =>
          l.action === 'DELETE_REVIEW' && l.targetId === review.body.id,
      ),
    ).toBe(true);
  });

  it('force-sets a DEV transaction status and logs it', async () => {
    const admin = await makeAdmin();
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set({ Authorization: `Bearer ${host.accessToken}` })
      .send({
        format: 'TAKEAWAY',
        title: 'Admin transaction test',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FIXED',
        priceAmount: 300,
        maxGuests: 10,
      })
      .expect(201);
    const tx = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.body.id}/transactions`)
      .set({ Authorization: `Bearer ${guest.accessToken}` })
      .send({})
      .expect(201);

    const forced = await request(app.getHttpServer())
      .patch(`/api/v1/admin/transactions/${tx.body.id}`)
      .set(admin.H)
      .send({ status: 'FAILED' })
      .expect(200);
    expect(forced.body.status).toBe('FAILED');

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/logs')
      .set(admin.H)
      .expect(200);
    expect(
      logs.body.items.some(
        (l: { action: string; targetId: string }) =>
          l.action === 'SET_TRANSACTION_STATUS' && l.targetId === tx.body.id,
      ),
    ).toBe(true);
  });

  it('admin stats reflect real counts', async () => {
    const admin = await makeAdmin();
    const before = await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set(admin.H)
      .expect(200);

    const host = await registerAndLogin(app);
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .set({ Authorization: `Bearer ${host.accessToken}` })
      .send({
        format: 'IN_PERSON',
        title: 'Stats test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set(admin.H)
      .expect(200);
    expect(after.body.events).toBe(before.body.events + 1);
    expect(after.body.users).toBeGreaterThan(before.body.users);
  });
});
