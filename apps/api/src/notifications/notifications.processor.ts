import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationJobSchema } from '@trimatch/shared';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsService } from './notifications.service';

// The worker draining the notifications queue: it validates each job payload and
// persists a per-user notification. Hand-offs (task 869dzm9fm) enqueue the jobs.
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<{ handled: boolean; id: string }> {
    const payload = NotificationJobSchema.parse(job.data);
    const created = await this.notifications.create(payload);
    this.logger.debug(
      `persisted ${payload.type} notification ${created.id} for ${payload.recipientId}`,
    );
    return { handled: true, id: created.id };
  }
}
