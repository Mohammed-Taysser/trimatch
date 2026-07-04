import { Logger } from '@nestjs/common';
import {
  NotificationDigest,
  OutboundChannel,
  PasswordChangedNotice,
  PasswordResetDelivery,
} from './outbound-channel';

// The default when NOTIFICATIONS_CHANNEL=none: out-of-app delivery is disabled
// cleanly. The digest still runs (and can be observed in logs) but sends nothing.
export class NoopOutboundChannel implements OutboundChannel {
  readonly name = 'none';
  private readonly logger = new Logger(NoopOutboundChannel.name);

  async deliver(digest: NotificationDigest): Promise<void> {
    this.logger.debug(
      `outbound disabled — skipped digest of ${digest.unread.length} for ${digest.recipientId}`,
    );
  }

  async deliverPasswordReset(reset: PasswordResetDelivery): Promise<void> {
    // Never log the code.
    this.logger.debug(`outbound disabled — skipped password-reset for ${reset.recipientEmail}`);
  }

  async deliverPasswordChanged(notice: PasswordChangedNotice): Promise<void> {
    this.logger.debug(`outbound disabled — skipped password-changed for ${notice.recipientEmail}`);
  }
}
