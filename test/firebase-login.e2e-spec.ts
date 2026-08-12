import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Firebase (Google/Apple) login (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses when Firebase Admin credentials are unset', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/firebase')
      .send({ idToken: 'not-a-real-token' })
      .expect(503);
  });

  it('rejects an empty body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/firebase')
      .send({})
      .expect(400);
  });
});
