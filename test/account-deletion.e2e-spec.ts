import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

describe('Account deletion (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('DELETE /users/me removes the user and rejects the old token', async () => {
    const { accessToken, userId } = await registerAndLogin(app);
    const prisma = getPrisma(app);

    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const gone = await prisma.user.findUnique({ where: { id: userId } });
    expect(gone).toBeNull();

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });
});
