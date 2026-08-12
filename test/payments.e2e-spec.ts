import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Payment methods + DEV transactions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds a card, sets a new default, and removes a card', async () => {
    const user = await registerAndLogin(app);
    const H = { Authorization: `Bearer ${user.accessToken}` };

    const cardA = await request(app.getHttpServer())
      .post('/api/v1/users/me/payment-methods')
      .set(H)
      .send({ type: 'CARD', cardMask: '**** 4242', isDefault: true })
      .expect(201);
    const cardB = await request(app.getHttpServer())
      .post('/api/v1/users/me/payment-methods')
      .set(H)
      .send({ type: 'CARD', cardMask: '**** 1111' })
      .expect(201);

    let list = await request(app.getHttpServer())
      .get('/api/v1/users/me/payment-methods')
      .set(H)
      .expect(200);
    expect(
      list.body.find((m: { id: string }) => m.id === cardA.body.id).isDefault,
    ).toBe(true);
    expect(
      list.body.find((m: { id: string }) => m.id === cardB.body.id).isDefault,
    ).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/payment-methods/${cardB.body.id}/default`)
      .set(H)
      .expect(200);

    list = await request(app.getHttpServer())
      .get('/api/v1/users/me/payment-methods')
      .set(H)
      .expect(200);
    expect(
      list.body.find((m: { id: string }) => m.id === cardA.body.id).isDefault,
    ).toBe(false);
    expect(
      list.body.find((m: { id: string }) => m.id === cardB.body.id).isDefault,
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/payment-methods/${cardA.body.id}`)
      .set(H)
      .expect(200);
    list = await request(app.getHttpServer())
      .get('/api/v1/users/me/payment-methods')
      .set(H)
      .expect(200);
    expect(list.body.some((m: { id: string }) => m.id === cardA.body.id)).toBe(
      false,
    );
  });

  it('never stores a real card number — cardMask must look like a mask', async () => {
    const user = await registerAndLogin(app);
    const H = { Authorization: `Bearer ${user.accessToken}` };

    await request(app.getHttpServer())
      .post('/api/v1/users/me/payment-methods')
      .set(H)
      .send({ type: 'CARD', cardMask: '4242424242424242' })
      .expect(400);
  });

  it('rejects removing or defaulting someone else’s payment method', async () => {
    const owner = await registerAndLogin(app);
    const intruder = await registerAndLogin(app);
    const card = await request(app.getHttpServer())
      .post('/api/v1/users/me/payment-methods')
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .send({ type: 'CARD', cardMask: '**** 9999' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/payment-methods/${card.body.id}`)
      .set({ Authorization: `Bearer ${intruder.accessToken}` })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/payment-methods/${card.body.id}/default`)
      .set({ Authorization: `Bearer ${intruder.accessToken}` })
      .expect(403);
  });

  it('creates a DEV-mode test transaction and lets the owner flip it to SUCCESS or FAILED', async () => {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const HH = { Authorization: `Bearer ${host.accessToken}` };
    const GH = { Authorization: `Bearer ${guest.accessToken}` };

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set(HH)
      .send({
        format: 'TAKEAWAY',
        title: 'Paid takeaway test',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FIXED',
        priceAmount: 500,
        maxGuests: 10,
      })
      .expect(201);

    const tx = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.body.id}/transactions`)
      .set(GH)
      .send({})
      .expect(201);
    expect(tx.body.isTestMode).toBe(true);
    expect(tx.body.status).toBe('PENDING');
    expect(tx.body.amount).toBe(500);

    const simulated = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${tx.body.id}/simulate`)
      .set(GH)
      .send({ status: 'SUCCESS' })
      .expect(200);
    expect(simulated.body.status).toBe('SUCCESS');

    // another user cannot simulate someone else's transaction
    const outsider = await registerAndLogin(app);
    await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${tx.body.id}/simulate`)
      .set({ Authorization: `Bearer ${outsider.accessToken}` })
      .send({ status: 'FAILED' })
      .expect(403);
  });
});
