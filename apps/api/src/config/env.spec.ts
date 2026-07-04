import { validateEnv } from './env';

const validEnv = {
  NODE_ENV: 'test',
  API_PORT: '3000',
  DATABASE_URL: 'postgres://trimatch:trimatch@localhost:5432/trimatch',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret-at-least-16-chars',
  JWT_EXPIRES_IN: '1h',
  NOTIFICATIONS_CHANNEL: 'none',
  THROTTLE_TTL: '60000',
  THROTTLE_LIMIT: '100',
  THROTTLE_AUTH_TTL: '60000',
  THROTTLE_AUTH_LIMIT: '5',
  TRUST_PROXY: '0',
};

describe('app refuses to boot with invalid env config (AC 3)', () => {
  it('accepts a complete valid environment', () => {
    const env = validateEnv(validEnv);
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });

  it('throws when NODE_ENV is missing — no silent defaults', () => {
    const { NODE_ENV, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/NODE_ENV/);
  });

  it('throws when API_PORT is missing — no silent defaults', () => {
    const { API_PORT, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/API_PORT/);
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a postgres URL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'mysql://nope' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('throws when REDIS_URL is missing', () => {
    const { REDIS_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/REDIS_URL/);
  });

  it('throws when API_PORT is not a number', () => {
    expect(() => validateEnv({ ...validEnv, API_PORT: 'not-a-port' })).toThrow(/API_PORT/);
  });

  it('reports a root-level error when config is not an object', () => {
    expect(() => validateEnv(null as unknown as Record<string, unknown>)).toThrow(/\(root\)/);
  });

  it('throws when JWT_SECRET is missing — no silent defaults', () => {
    const { JWT_SECRET, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is shorter than 16 characters', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('throws when NOTIFICATIONS_CHANNEL is missing — no silent defaults', () => {
    const { NOTIFICATIONS_CHANNEL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/NOTIFICATIONS_CHANNEL/);
  });

  it('throws when NOTIFICATIONS_CHANNEL is not a supported value', () => {
    expect(() => validateEnv({ ...validEnv, NOTIFICATIONS_CHANNEL: 'sms' })).toThrow(
      /NOTIFICATIONS_CHANNEL/,
    );
  });

  it('accepts the webhook channel when its URL is provided', () => {
    const env = validateEnv({
      ...validEnv,
      NOTIFICATIONS_CHANNEL: 'webhook',
      NOTIFICATIONS_WEBHOOK_URL: 'https://hooks.example.com/notify',
    });
    expect(env.NOTIFICATIONS_CHANNEL).toBe('webhook');
  });

  it('fails loudly on partial config — webhook channel without its URL', () => {
    expect(() => validateEnv({ ...validEnv, NOTIFICATIONS_CHANNEL: 'webhook' })).toThrow(
      /NOTIFICATIONS_WEBHOOK_URL/,
    );
  });

  it('does not require a webhook URL when the channel is none', () => {
    expect(() => validateEnv({ ...validEnv, NOTIFICATIONS_CHANNEL: 'none' })).not.toThrow();
  });

  it('coerces the throttle limits to numbers', () => {
    const env = validateEnv(validEnv);
    expect(env.THROTTLE_LIMIT).toBe(100);
    expect(env.THROTTLE_AUTH_LIMIT).toBe(5);
  });

  it('throws when a throttle limit is missing — no silent defaults', () => {
    const { THROTTLE_LIMIT, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/THROTTLE_LIMIT/);
  });

  it('throws when a throttle limit is not a positive number', () => {
    expect(() => validateEnv({ ...validEnv, THROTTLE_AUTH_LIMIT: '0' })).toThrow(
      /THROTTLE_AUTH_LIMIT/,
    );
  });

  it('throws when TRUST_PROXY is missing — no silent default', () => {
    const { TRUST_PROXY, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/TRUST_PROXY/);
  });

  it('coerces TRUST_PROXY to a number and rejects a negative hop count', () => {
    expect(validateEnv({ ...validEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => validateEnv({ ...validEnv, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });
});
