import { z, ZodType } from 'zod';

// Code-defined catalogue of settings (869e01dmv). Definitions — not the DB — hold
// the default and the validation schema; the DB only stores overrides. A key that
// is not in this registry is rejected (no silent/unknown settings).
export interface SettingDefinition<T = unknown> {
  key: string;
  schema: ZodType<T>;
  // The documented code default, used when nothing is stored at any scope.
  default: T;
  // Where the value may be written. A user-settable setting resolves
  // user -> company -> default; a company-only one resolves company -> default.
  companySettable: boolean;
  userSettable: boolean;
  description: string;
}

function define<T>(def: SettingDefinition<T>): SettingDefinition<T> {
  return def;
}

export const SETTINGS = {
  // Company policy: mandate 2FA enrolment for everyone (enforced at login/disable).
  'security.require2fa': define({
    key: 'security.require2fa',
    schema: z.boolean(),
    default: false,
    companySettable: true,
    userSettable: false,
    description: 'Require every user to set up two-factor authentication.',
  }),
  // Per-user preference (with a company-wide default): receive digest emails.
  'notifications.emailEnabled': define({
    key: 'notifications.emailEnabled',
    schema: z.boolean(),
    default: true,
    companySettable: true,
    userSettable: true,
    description: 'Receive notification digest emails (in-app notifications are unaffected).',
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

export function settingDefinition(key: string): SettingDefinition {
  if (!isSettingKey(key)) {
    throw new Error(`Unknown setting key: ${key}`);
  }
  return SETTINGS[key] as SettingDefinition;
}

export const ALL_SETTINGS: SettingDefinition[] = Object.values(SETTINGS);
