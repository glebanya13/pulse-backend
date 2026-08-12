import { forwardRef, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ChatsService } from './chats.service';

type AuthedSocket = Socket & { data: { userId?: string } };

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(ChatsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatsService))
    private readonly chatsService: ChatsService,
  ) {}

  onModuleDestroy() {
    this.server?.disconnectSockets(true);
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isBlocked: true },
      });
      if (!user || user.isBlocked) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      this.logger.debug(`WS connected user=${user.id} sid=${client.id}`);
    } catch (e) {
      this.logger.debug(`WS auth failed: ${String(e)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(
      `WS disconnected user=${client.data.userId ?? '?'} sid=${client.id}`,
    );
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId?: string },
  ) {
    const userId = client.data.userId;
    const chatId = body?.chatId?.trim();
    if (!userId || !chatId) return { ok: false };

    try {
      await this.chatsService.ensureParticipant(chatId, userId);
      await client.join(this.room(chatId));
      return { ok: true, chatId };
    } catch (e) {
      this.logger.debug(`WS join denied chat=${chatId}: ${String(e)}`);
      return { ok: false };
    }
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId?: string },
  ) {
    const chatId = body?.chatId?.trim();
    if (!chatId) return { ok: false };
    await client.leave(this.room(chatId));
    return { ok: true, chatId };
  }

  /** Fan-out a persisted message to everyone currently in the chat room. */
  emitNewMessage(chatId: string, message: unknown) {
    this.server?.to(this.room(chatId)).emit('message:new', message);
  }

  private room(chatId: string) {
    return `chat:${chatId}`;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.trim()) {
      return auth.token.trim();
    }

    const query = client.handshake.query?.token;
    if (typeof query === 'string' && query.trim()) return query.trim();
    if (Array.isArray(query) && typeof query[0] === 'string') {
      return query[0].trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }

    return null;
  }
}
