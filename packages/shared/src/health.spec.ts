import { HealthLivenessSchema, HealthReadinessSchema } from './health';

describe('shared zod schemas are consumed by both apps (AC 2)', () => {
  it('accepts a valid liveness payload', () => {
    const parsed = HealthLivenessSchema.parse({
      status: 'ok',
      service: 'trimatch-api',
      uptimeSeconds: 12.5,
      timestamp: '2026-07-02T12:00:00.000Z',
    });
    expect(parsed.status).toBe('ok');
  });

  it('rejects a liveness payload with an unknown status', () => {
    expect(() =>
      HealthLivenessSchema.parse({
        status: 'down',
        service: 'trimatch-api',
        uptimeSeconds: 1,
        timestamp: '2026-07-02T12:00:00.000Z',
      }),
    ).toThrow();
  });

  it('accepts both ok and degraded readiness payloads', () => {
    const ok = HealthReadinessSchema.parse({
      status: 'ok',
      checks: { postgres: true, redis: true },
    });
    const degraded = HealthReadinessSchema.parse({
      status: 'degraded',
      checks: { postgres: false, redis: true },
    });
    expect(ok.status).toBe('ok');
    expect(degraded.checks.postgres).toBe(false);
  });
});
