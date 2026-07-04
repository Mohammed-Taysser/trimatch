import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DIGEST_CRON, NOTIFICATIONS_DIGEST_QUEUE } from './notifications-digest.constants';
import { OUTBOUND_CHANNEL, OutboundChannel } from './outbound/outbound-channel';

// Registers the repeatable digest job — but only when an outbound channel is
// configured. With NOTIFICATIONS_CHANNEL=none the digest is disabled cleanly and
// nothing touches Redis, so the feature adds no cost when unused.
@Injectable()
export class NotificationsDigestScheduler implements OnModuleInit {
  private readonly logger = new Logger(NotificationsDigestScheduler.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_DIGEST_QUEUE) private readonly queue: Queue,
    @Inject(OUTBOUND_CHANNEL) private readonly channel: OutboundChannel,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.channel.name === 'none') {
      this.logger.log('outbound channel disabled — digest not scheduled');
      return;
    }
    // Re-adding the same repeatable pattern is idempotent (BullMQ dedupes by key).
    await this.queue.add(
      'digest',
      {},
      { repeat: { pattern: DIGEST_CRON }, removeOnComplete: true, removeOnFail: 100 },
    );
    this.logger.log(`digest scheduled (${DIGEST_CRON}) via '${this.channel.name}'`);
  }
}
