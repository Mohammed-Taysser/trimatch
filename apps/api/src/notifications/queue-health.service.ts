import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

// Readiness for the notifications queue — pings the queue's Redis connection.
@Injectable()
export class QueueHealth {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  async isReady(): Promise<boolean> {
    try {
      // `queue.client` resolves once BullMQ's Redis connection is up; race a
      // timeout so a down Redis degrades readiness instead of hanging it.
      const client = await Promise.race([
        this.queue.client,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue readiness timeout')), 1000).unref(),
        ),
      ]);
      return client.status === 'ready';
    } catch {
      return false;
    }
  }
}
