import { NotificationType } from '@trimatch/shared';

// One unread notification as it appears in a recipient's digest.
export interface DigestEntry {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: string;
}

// A batched, per-recipient digest handed to the outbound channel.
export interface NotificationDigest {
  recipientId: string;
  recipientEmail: string;
  recipientName: string;
  unread: DigestEntry[];
}

// A password-reset OTP to deliver out-of-band (Epic 16). The code is short-lived
// and single-use; it is never persisted in clear text nor logged.
export interface PasswordResetDelivery {
  recipientEmail: string;
  recipientName: string;
  code: string;
  expiresAt: string;
}

// Pluggable out-of-app delivery (Epic 9). Implementations: a no-op default and
// a webhook channel, selected by NOTIFICATIONS_CHANNEL. Injected via the token.
export interface OutboundChannel {
  readonly name: string;
  deliver(digest: NotificationDigest): Promise<void>;
  deliverPasswordReset(reset: PasswordResetDelivery): Promise<void>;
}

export const OUTBOUND_CHANNEL = Symbol('OUTBOUND_CHANNEL');
