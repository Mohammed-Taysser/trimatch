import { Processor, WorkerHost } from '@nestjs/bullmq';
import { NOTIFICATIONS_DIGEST_QUEUE } from './notifications-digest.constants';
import { DigestSummary, NotificationsDigestService } from './notifications-digest.service';

// Drains the repeatable digest job — each firing batches and delivers.
@Processor(NOTIFICATIONS_DIGEST_QUEUE)
export class NotificationsDigestProcessor extends WorkerHost {
  constructor(private readonly digest: NotificationsDigestService) {
    super();
  }

  async process(): Promise<DigestSummary> {
    return this.digest.runDigest();
  }
}
