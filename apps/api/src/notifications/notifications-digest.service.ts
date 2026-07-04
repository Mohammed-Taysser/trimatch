import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../identity/user.model';
import { SettingsService } from '../settings/settings.service';
import { Notification } from './notification.model';
import { NotificationDigest, OUTBOUND_CHANNEL, OutboundChannel } from './outbound/outbound-channel';

export interface DigestSummary {
  recipients: number;
  delivered: number;
  skipped: number;
}

@Injectable()
export class NotificationsDigestService {
  private readonly logger = new Logger(NotificationsDigestService.name);

  constructor(
    @InjectModel(Notification) private readonly notifications: typeof Notification,
    @Inject(OUTBOUND_CHANNEL) private readonly channel: OutboundChannel,
    private readonly settings: SettingsService,
  ) {}

  // Batches every recipient's unread notifications into one digest and hands it
  // to the outbound channel. Delivery failures are isolated per recipient so one
  // bad send never drops the rest.
  async runDigest(): Promise<DigestSummary> {
    const rows = await this.notifications.findAll({
      where: { read: false },
      include: [{ model: User, as: 'recipient' }],
      order: [['createdAt', 'DESC']],
    });

    const byRecipient = new Map<string, Notification[]>();
    for (const row of rows) {
      const bucket = byRecipient.get(row.recipientId) ?? [];
      bucket.push(row);
      byRecipient.set(row.recipientId, bucket);
    }

    let delivered = 0;
    let skipped = 0;
    for (const [recipientId, bucket] of byRecipient) {
      const recipient = bucket[0].recipient;
      if (!recipient) continue; // recipient gone (soft-delete/erasure) — skip
      // 869e01dmv: honour the per-user email preference. The in-app notification
      // rows already exist; this only gates the outbound digest email.
      if (!(await this.settings.getForUser<boolean>('notifications.emailEnabled', recipientId))) {
        skipped += 1;
        continue;
      }
      const digest: NotificationDigest = {
        recipientId,
        recipientEmail: recipient.email,
        recipientName: recipient.fullName,
        unread: bucket.map((row) => ({
          id: row.id,
          type: row.type,
          message: row.message,
          createdAt: (row.createdAt as Date).toISOString(),
        })),
      };
      try {
        await this.channel.deliver(digest);
        delivered += 1;
      } catch (error) {
        this.logger.error(`digest delivery failed for ${recipientId}`, error as Error);
      }
    }

    this.logger.log(
      `digest via '${this.channel.name}': delivered ${delivered}/${byRecipient.size} recipients ` +
        `(${skipped} skipped by preference)`,
    );
    return { recipients: byRecipient.size, delivered, skipped };
  }
}
