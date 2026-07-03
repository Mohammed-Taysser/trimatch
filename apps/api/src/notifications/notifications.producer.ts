import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationJob } from '@trimatch/shared';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

// Enqueues notification jobs at workflow hand-offs. Emission is best-effort:
// a queue failure must NEVER fail the business operation that triggered it, so
// every method swallows and logs rather than throws. Callers emit only AFTER
// their transaction has committed, so a rolled-back change is never announced.
@Injectable()
export class NotificationsProducer {
  private readonly logger = new Logger(NotificationsProducer.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  async emit(job: NotificationJob): Promise<void> {
    try {
      await this.queue.add(job.type, job, { removeOnComplete: true, removeOnFail: 500 });
    } catch (error) {
      this.logger.error(`failed to enqueue ${job.type} for ${job.recipientId}`, error as Error);
    }
  }

  // Fan-out to several recipients (e.g. every AP user on an invoice exception).
  async emitEach(
    recipientIds: string[],
    build: (recipientId: string) => NotificationJob,
  ): Promise<void> {
    if (recipientIds.length === 0) return;
    try {
      await this.queue.addBulk(
        recipientIds.map((recipientId) => {
          const job = build(recipientId);
          return { name: job.type, data: job, opts: { removeOnComplete: true, removeOnFail: 500 } };
        }),
      );
    } catch (error) {
      this.logger.error(
        `failed to enqueue fan-out to ${recipientIds.length} recipients`,
        error as Error,
      );
    }
  }
}
