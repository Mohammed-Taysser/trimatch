import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Notification } from '@trimatch/shared';
import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
// The gateway is exercised directly (emitToUser) rather than through the shared
// BullMQ queue, so a job can't be grabbed by another worker on the same Redis
// (e.g. a running dev server) — the queue → processor → emit wiring is covered
// by the processor unit spec.
const PASSWORD = 'Demo123!';

function subOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub as string;
}

function waitFor<T>(resolver: (resolve: (value: T) => void) => void, ms = 1500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    resolver((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function notificationFor(recipientId: string, message: string): Notification {
  return {
    id: '019787c8-0000-4000-8000-0000000000aa',
    recipientId,
    type: 'requisition.approved',
    entityType: 'requisition',
    entityId: '019787c8-0000-4000-8000-0000000000bb',
    message,
    read: false,
    createdAt: '2026-07-04T00:00:00.000Z',
    updatedAt: '2026-07-04T00:00:00.000Z',
  };
}

describe('real-time notification delivery (Epic 9 · WebSocket)', () => {
  let app: INestApplication;
  let gateway: NotificationsGateway;
  let url: string;
  let tokenA: string;
  let userA: string;
  let userB: string;
  const sockets: Socket[] = [];

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  function connect(token?: string): Socket {
    const socket = io(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.listen(0); // ephemeral port so socket.io-client can connect over ws
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    gateway = app.get(NotificationsGateway);
    tokenA = await login('requester@demo');
    const tokenB = await login('requester2@demo');
    userA = subOf(tokenA);
    userB = subOf(tokenB);
    expect(userB).not.toEqual(userA);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  });

  it('pushes a notification to the recipient socket in real time', async () => {
    const socket = connect(tokenA);
    await waitFor<boolean>((resolve) => socket.on('ready', () => resolve(true)));
    const received = waitFor<Notification>((resolve) => socket.on('notification', resolve));
    gateway.emitToUser(userA, notificationFor(userA, 'live push'));
    const payload = await received;
    expect(payload.message).toBe('live push');
    expect(payload.recipientId).toBe(userA);
  });

  it("does not deliver another user's notification to the socket", async () => {
    const socket = connect(tokenA);
    await waitFor<boolean>((resolve) => socket.on('ready', () => resolve(true)));
    let leaked = false;
    socket.on('notification', () => {
      leaked = true;
    });
    gateway.emitToUser(userB, notificationFor(userB, 'for B only'));
    await new Promise((resolve) => setTimeout(resolve, 200)); // give any errant emit time to arrive
    expect(leaked).toBe(false);
  });

  it('rejects an unauthenticated handshake', async () => {
    const socket = connect(); // no token
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(socket.connected).toBe(false);
  });

  it('rejects a handshake with an invalid token', async () => {
    const socket = connect('not.a.jwt');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(socket.connected).toBe(false);
  });
});
