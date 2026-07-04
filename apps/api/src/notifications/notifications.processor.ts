import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationJobSchema } from '@trimatch/shared';
import { Job } from 'bullmq';
import { NotificationsGateway } from './notifications.gateway';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsService } from './notifications.service';

// The worker draining the notifications queue: it validates each job payload,
// persists a per-user notification, then pushes it to the recipient's live
// socket. Hand-offs (task 869dzm9fm) enqueue the jobs.
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) {
    super();
  }

  async process(job: Job): Promise<{ handled: boolean; id: string }> {
    const payload = NotificationJobSchema.parse(job.data);
    const created = await this.notifications.create(payload);
    this.gateway.emitToUser(created.recipientId, created);
    this.logger.debug(
      `persisted ${payload.type} notification ${created.id} for ${payload.recipientId}`,
    );
    return { handled: true, id: created.id };
  }
}
