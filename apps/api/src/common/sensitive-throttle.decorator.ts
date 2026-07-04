import { SetMetadata } from '@nestjs/common';

// Marks a route as credential-sensitive so the stricter "auth" throttler applies
// to it (login, and later password-reset). The throttler's skipIf reads this.
export const SENSITIVE_THROTTLE = 'sensitiveThrottle';
export const SensitiveThrottle = () => SetMetadata(SENSITIVE_THROTTLE, true);
