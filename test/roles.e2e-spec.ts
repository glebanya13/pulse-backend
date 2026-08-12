import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

describe('Role permissions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a regular USER from every /admin route', async () => {
    const { accessToken } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('allows an ADMIN-role user into /admin routes, and the block action takes effect immediately', async () => {
    const { accessToken: adminToken, userId: adminId } =
      await registerAndLogin(app);
    const prisma = getPrisma(app);
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ADMIN' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.users).toEqual(expect.any(Number));

    // Role is re-read from the DB on every request (JwtStrategy.validate), not
    // cached in the JWT — promoting mid-session must take effect without a
    // fresh login. Demonstrate the reverse too: demoting revokes admin access
    // on the very next request with the same still-valid token.
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'USER' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });
});
