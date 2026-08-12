import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, registerAndLogin } from './utils/test-app';

describe('Chat (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Accepting an application is the only way a chat gets created. */
  async function setUpChat() {
    const host = await registerAndLogin(app);
    const guest = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({
        format: 'IN_PERSON',
        title: 'Chat test dinner',
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priceType: 'FREE',
        maxGuests: 4,
      })
      .expect(201);

    const application = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.body.id}/applications`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/applications/${application.body.id}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    const chats = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .expect(200);
    const chatId = chats.body.items[0].id;

    return { host, guest, stranger, chatId, eventId: event.body.id };
  }

  it('lets participants send and read messages, and notifies the other participant', async () => {
    const { host, guest, chatId, eventId } = await setUpChat();

    const sent = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({ text: 'Привет! Во сколько приходить?' })
      .expect(201);
    expect(sent.body.text).toBe('Привет! Во сколько приходить?');
    expect(sent.body.sender.id).toBeDefined();

    const chatList = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .expect(200);
    const preview = chatList.body.items.find(
      (c: { id: string }) => c.id === chatId,
    );
    expect(preview?.messages?.[0]?.sender?.id).toBe(guest.userId);

    const byEvent = await request(app.getHttpServer())
      .get(`/api/v1/chats/by-event/${eventId}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(byEvent.body.id).toBe(chatId);

    const eventDetail = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(eventDetail.body.chatId).toBe(chatId);
    expect(eventDetail.body.currentGuestsCount).toBe(1);
    expect(preview?.unreadCount).toBeDefined();

    const unread = await request(app.getHttpServer())
      .get('/api/v1/chats/unread-count')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(typeof unread.body.unreadTotal).toBe('number');

    const messages = await request(app.getHttpServer())
      .get(`/api/v1/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(
      messages.body.items.some((m: { id: string }) => m.id === sent.body.id),
    ).toBe(true);

    const notifications = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(200);
    expect(
      notifications.body.items.some(
        (n: { type: string }) => n.type === 'NEW_MESSAGE',
      ),
    ).toBe(true);
  });

  it('rejects a non-participant from reading or posting in the chat', async () => {
    const { stranger, chatId } = await setUpChat();

    await request(app.getHttpServer())
      .get(`/api/v1/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ text: 'sneaking in' })
      .expect(403);
  });

  it('marks messages as read', async () => {
    const { host, guest, chatId } = await setUpChat();

    await request(app.getHttpServer())
      .post(`/api/v1/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({ text: 'unread from guest' })
      .expect(201);

    const marked = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chatId}/read`)
      .set('Authorization', `Bearer ${host.accessToken}`)
      .expect(201);
    expect(marked.body.markedCount).toBeGreaterThan(0);
  });
});
