import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

// The worker draining the notifications queue. Persistence + fan-out land with
// the notification model (task 869dzm9fj); this proves the enqueue → worker
// path end to end.
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async process(job: Job): Promise<{ handled: boolean }> {
    this.logger.debug(`processed ${job.name} job ${job.id ?? '?'}`);
    return { handled: true };
  }
}
