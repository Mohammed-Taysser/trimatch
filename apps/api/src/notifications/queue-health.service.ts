import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

// Readiness for the notifications queue and its Redis connection. Both checks go
// through BullMQ's live client (a single connection to REDIS_URL).
@Injectable()
export class QueueHealth {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  async isReady(): Promise<boolean> {
    try {
      return (await this.client()).status === 'ready';
    } catch {
      return false;
    }
  }

  // Real Redis PING over the queue's connection — proves Redis answers commands,
  // not merely that the socket is open (869dzr3jw upgrade from a TCP probe).
  async pingRedis(): Promise<boolean> {
    try {
      return (await (await this.client()).ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  // `queue.client` resolves once BullMQ's Redis connection is up; race a timeout
  // so a down Redis degrades readiness instead of hanging it. BullMQ types the
  // client as a minimal interface — at runtime it is the ioredis instance.
  private async client(): Promise<Redis> {
    const client = await Promise.race([
      this.queue.client,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('queue readiness timeout')), 1000).unref(),
      ),
    ]);
    return client as unknown as Redis;
  }
}
