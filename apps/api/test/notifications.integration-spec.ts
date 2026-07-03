import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotificationListSchema, NotificationSchema } from '@trimatch/shared';
import { Queue, QueueEvents } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATIONS_QUEUE } from '../src/notifications/notifications.constants';
import { NotificationsService } from '../src/notifications/notifications.service';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

// The signed-in user id is the JWT `sub`; notifications scope to it.
function subOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub as string;
}

describe('in-app notifications (Epic 9 · notification center · own-only)', () => {
  let app: INestApplication;
  let service: NotificationsService;
  let queue: Queue;
  let events: QueueEvents;
  let tokenA: string;
  let userA: string;
  let userB: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  function listOwn(token: string, qs = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/notifications?pageSize=100${qs}`)
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    service = app.get(NotificationsService);
    queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    events = new QueueEvents(NOTIFICATIONS_QUEUE, { connection: queue.opts.connection });
    await events.waitUntilReady();
    tokenA = await login('requester@demo');
    const tokenB = await login('requester2@demo');
    userA = subOf(tokenA);
    userB = subOf(tokenB);
    // separate binding so the second token isn't flagged unused
    expect(userB).not.toEqual(userA);
  });

  afterAll(async () => {
    await events.close();
    await app.close();
  });

  it('the queue worker persists an enqueued notification for its recipient', async () => {
    const job = await queue.add('handoff', {
      recipientId: userA,
      type: 'requisition.approved',
      message: 'Approved via queue',
    });
    await job.waitUntilFinished(events);

    const res = await listOwn(tokenA).expect(200);
    const list = NotificationListSchema.parse(res.body.data);
    expect(list.some((n) => n.message === 'Approved via queue')).toBe(true);
    expect(res.body.meta).toEqual(
      expect.objectContaining({ page: 1, pageSize: 100, total: expect.any(Number) }),
    );
  });

  it('a user sees only their own notifications', async () => {
    const mine = await service.create({
      recipientId: userA,
      type: 'po.issued',
      message: 'A: PO issued',
    });
    const theirs = await service.create({
      recipientId: userB,
      type: 'po.issued',
      message: 'B: PO issued',
    });

    const ids = NotificationListSchema.parse((await listOwn(tokenA).expect(200)).body.data).map(
      (n) => n.id,
    );
    expect(ids).toContain(mine.id); // newest → page 1
    expect(ids).not.toContain(theirs.id);
  });

  it('the unread filter returns only unread notifications', async () => {
    const readOne = await service.create({
      recipientId: userA,
      type: 'invoice.matched',
      message: 'read one',
    });
    await service.markRead(readOne.id, userA);

    const list = NotificationListSchema.parse(
      (await listOwn(tokenA, '&unread=true').expect(200)).body.data,
    );
    expect(list.every((n) => n.read === false)).toBe(true);
    expect(list.some((n) => n.id === readOne.id)).toBe(false);
  });

  it('marks a notification read', async () => {
    const n = await service.create({
      recipientId: userA,
      type: 'grn.recorded',
      message: 'to be read',
    });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(NotificationSchema.parse(res.body.data).read).toBe(true);
  });

  it("cannot mark another user's notification read — 404, no existence leak", async () => {
    const theirs = await service.create({
      recipientId: userB,
      type: 'grn.recorded',
      message: 'B only',
    });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${theirs.id}/read`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rejects an invalid unread value with 422', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?unread=maybe')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
