import { Logger } from '@nestjs/common';
import { NotificationDigest, OutboundChannel, PasswordResetDelivery } from './outbound-channel';

// Posts each recipient's digest to the configured webhook (NOTIFICATIONS_WEBHOOK_URL).
// A non-2xx or network failure throws so the digest job can log it per recipient
// without aborting the others.
export class WebhookOutboundChannel implements OutboundChannel {
  readonly name = 'webhook';
  private readonly logger = new Logger(WebhookOutboundChannel.name);

  constructor(private readonly url: string) {}

  async deliver(digest: NotificationDigest): Promise<void> {
    await this.post(digest);
    this.logger.debug(
      `delivered digest of ${digest.unread.length} to webhook for ${digest.recipientId}`,
    );
  }

  async deliverPasswordReset(reset: PasswordResetDelivery): Promise<void> {
    await this.post({ type: 'password_reset', ...reset });
    // Never log the code.
    this.logger.debug(`delivered password-reset to webhook for ${reset.recipientEmail}`);
  }

  private async post(payload: unknown): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`webhook responded ${response.status}`);
    }
  }
}
