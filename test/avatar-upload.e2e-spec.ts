import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, registerAndLogin } from './utils/test-app';

// A minimal valid 1x1 PNG, used instead of a real photo fixture — only the
// file extension/mime type and multer wiring are under test here.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Avatar / photo upload (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uploads a photo, sets it as the avatar, and only stores a path (never base64) on the user', async () => {
    const { accessToken, userId } = await registerAndLogin(app);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/users/me/photos')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', TINY_PNG, 'avatar.png')
      .expect(201);

    expect(Array.isArray(uploadRes.body.photos)).toBe(true);
    expect(uploadRes.body.photos.length).toBeGreaterThan(0);
    const url: string = uploadRes.body.photos[uploadRes.body.photos.length - 1];
    expect(url).toMatch(/^\/uploads\/.+\.png$/);

    const setAvatar = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatarUrl: url })
      .expect(200);
    expect(setAvatar.body.avatarUrl).toBe(url);
    expect(setAvatar.body.avatarUrl.length).toBeLessThan(200); // a URL, not an inlined image

    const prisma = getPrisma(app);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(stored.avatarUrl).toBe(url);
  });

  it('rejects a disallowed file type', async () => {
    const { accessToken } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/api/v1/users/me/photos')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', Buffer.from('not an image'), 'payload.exe')
      .expect(400);
  });

  it('deletes a photo and clears the avatar when it was the active one', async () => {
    const { accessToken } = await registerAndLogin(app);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/users/me/photos')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', TINY_PNG, 'avatar.png')
      .expect(201);
    const url: string = uploadRes.body.photos[0];

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatarUrl: url })
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .delete('/api/v1/users/me/photos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url })
      .expect(200);

    expect(afterDelete.body.photos).not.toContain(url);
    expect(afterDelete.body.avatarUrl).not.toBe(url);
  });
});
