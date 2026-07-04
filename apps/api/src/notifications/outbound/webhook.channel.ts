import { Logger } from '@nestjs/common';
import { NotificationDigest, OutboundChannel } from './outbound-channel';

// Posts each recipient's digest to the configured webhook (NOTIFICATIONS_WEBHOOK_URL).
// A non-2xx or network failure throws so the digest job can log it per recipient
// without aborting the others.
export class WebhookOutboundChannel implements OutboundChannel {
  readonly name = 'webhook';
  private readonly logger = new Logger(WebhookOutboundChannel.name);

  constructor(private readonly url: string) {}

  async deliver(digest: NotificationDigest): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(digest),
    });
    if (!response.ok) {
      throw new Error(`webhook responded ${response.status}`);
    }
    this.logger.debug(
      `delivered digest of ${digest.unread.length} to webhook for ${digest.recipientId}`,
    );
  }
}
