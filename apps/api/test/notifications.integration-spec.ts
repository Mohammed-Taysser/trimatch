import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue, QueueEvents } from 'bullmq';
import { AppModule } from '../src/app.module';
import { NOTIFICATIONS_QUEUE } from '../src/notifications/notifications.constants';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d (Redis on :6379).
// Proves the BullMQ foundation end to end: a job enqueued on the notifications
// queue is drained by the WorkerHost processor and returns its result.
describe('notifications queue (Epic 9 · BullMQ infrastructure)', () => {
  let app: INestApplication;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    events = new QueueEvents(NOTIFICATIONS_QUEUE, { connection: queue.opts.connection });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    await events.close();
    await app.close();
  });

  it('processes an enqueued job through the worker', async () => {
    const job = await queue.add('smoke', { ping: true });
    const result = await job.waitUntilFinished(events);
    expect(result).toEqual({ handled: true });
  });
});
