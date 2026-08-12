import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Guest requests + performer selection (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets multiple performers offer, and accepting one auto-declines the rest and locks in the request', async () => {
    const author = await registerAndLogin(app);
    const performerA = await registerAndLogin(app);
    const performerB = await registerAndLogin(app);

    const created = await request(app.getHttpServer())
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({
        type: 'GENERAL',
        title: 'Looking for company for dinner',
        budgetType: 'DONATION',
        requestedAt: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        address: 'Москва, парк Горького',
      })
      .expect(201);
    const requestId = created.body.id;

    const offerA = await request(app.getHttpServer())
      .post(`/api/v1/requests/${requestId}/offers`)
      .set('Authorization', `Bearer ${performerA.accessToken}`)
      .send({ message: 'I can host on Thursday' })
      .expect(201);
    const offerB = await request(app.getHttpServer())
      .post(`/api/v1/requests/${requestId}/offers`)
      .set('Authorization', `Bearer ${performerB.accessToken}`)
      .send({ message: 'I can host too' })
      .expect(201);

    // only the author may accept/decline offers
    await request(app.getHttpServer())
      .patch(`/api/v1/request-offers/${offerA.body.id}`)
      .set('Authorization', `Bearer ${performerB.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/request-offers/${offerA.body.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    // selection is persisted server-side, not just visual: refetching the
    // request shows performer B's offer auto-declined and the request locked in
    const refetched = await request(app.getHttpServer())
      .get(`/api/v1/requests/${requestId}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(200);
    expect(refetched.body.status).toBe('ACCEPTED');
    const offers = refetched.body.offers as Array<{
      id: string;
      status: string;
    }>;
    expect(offers.find((o) => o.id === offerA.body.id)?.status).toBe(
      'ACCEPTED',
    );
    expect(offers.find((o) => o.id === offerB.body.id)?.status).toBe(
      'DECLINED',
    );

    // a resolved offer can no longer be accepted/declined again
    await request(app.getHttpServer())
      .patch(`/api/v1/request-offers/${offerB.body.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(400);
  });

  it('lets a performer withdraw their own pending offer, but not someone else’s', async () => {
    const author = await registerAndLogin(app);
    const performer = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);

    const created = await request(app.getHttpServer())
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({
        type: 'GENERAL',
        title: 'Another dinner request',
        budgetType: 'FREE',
        requestedAt: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .expect(201);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/requests/${created.body.id}/offers`)
      .set('Authorization', `Bearer ${performer.accessToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/request-offers/${offer.body.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/request-offers/${offer.body.id}`)
      .set('Authorization', `Bearer ${performer.accessToken}`)
      .expect(200);
  });
});
