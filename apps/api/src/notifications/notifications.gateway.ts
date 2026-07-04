import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Notification } from '@trimatch/shared';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/decorators';

function bearer(header?: string): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

// Real-time notification push. Clients authenticate on the handshake with their
// JWT (either `auth.token` or an Authorization header) and are joined to a room
// named by their user id, so a socket only ever receives its OWN notifications.
// The Redis adapter (main.ts) fans room emits out across instances.
@WebSocketGateway({ cors: { origin: true } })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer() private readonly server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      bearer(client.handshake.headers.authorization);
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      client.data.userId = payload.sub;
      await client.join(payload.sub);
      // Signal that the room is joined, so a client knows when it will actually
      // receive pushes (closes the connect→join window).
      client.emit('ready');
    } catch {
      client.disconnect();
    }
  }

  // Called by the queue worker once a notification is persisted.
  emitToUser(userId: string, notification: Notification): void {
    this.server.to(userId).emit('notification', notification);
  }
}
