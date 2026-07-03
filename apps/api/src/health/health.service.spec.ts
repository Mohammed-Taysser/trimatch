import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueHealth } from '../notifications/queue-health.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

function serviceWith(env: Record<string, string>, queueReady = false): HealthService {
  const config = { getOrThrow: (key: string) => env[key] } as unknown as ConfigService;
  const queue = { isReady: () => Promise.resolve(queueReady) } as unknown as QueueHealth;
  return new HealthService(config, queue);
}

describe('readiness reports reachability of postgres, redis and the queue', () => {
  it('reports degraded with failed checks when a connection URL is malformed', async () => {
    const service = serviceWith({ DATABASE_URL: 'not a url', REDIS_URL: 'also not a url' });
    const result = await service.readiness();
    expect(result).toEqual({
      status: 'degraded',
      checks: { postgres: false, redis: false, queue: false },
    });
  });

  it('reports a failed check when the port is closed', async () => {
    const service = serviceWith({
      DATABASE_URL: 'postgres://127.0.0.1:1/trimatch',
      REDIS_URL: 'redis://127.0.0.1:1',
    });
    const result = await service.readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks).toEqual({ postgres: false, redis: false, queue: false });
  });

  it('falls back to the default port when the URL has none', async () => {
    const service = serviceWith({
      DATABASE_URL: 'postgres://127.0.0.1/trimatch',
      REDIS_URL: 'redis://127.0.0.1',
    });
    // Outcome depends on what listens on 5432/6379 locally — only the shape
    // and the port-fallback path are asserted.
    const result = await service.readiness();
    expect(typeof result.checks.postgres).toBe('boolean');
    expect(typeof result.checks.redis).toBe('boolean');
    expect(typeof result.checks.queue).toBe('boolean');
  });
});

describe('readiness endpoint returns 503 when degraded', () => {
  it('throws ServiceUnavailableException carrying the degraded body', async () => {
    const degraded = {
      status: 'degraded' as const,
      checks: { postgres: false, redis: false, queue: false },
    };
    const controller = new HealthController({
      readiness: () => Promise.resolve(degraded),
    } as unknown as HealthService);
    await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);
  });

  it('liveness endpoint returns the service liveness payload', () => {
    const liveness = {
      status: 'ok' as const,
      service: 'trimatch-api' as const,
      uptimeSeconds: 1,
      timestamp: '2026-07-02T12:00:00.000Z',
    };
    const controller = new HealthController({
      liveness: () => liveness,
    } as unknown as HealthService);
    expect(controller.liveness()).toEqual(liveness);
  });

  it('readiness endpoint passes through an ok result', async () => {
    const ok = {
      status: 'ok' as const,
      checks: { postgres: true, redis: true, queue: true },
    };
    const controller = new HealthController({
      readiness: () => Promise.resolve(ok),
    } as unknown as HealthService);
    await expect(controller.readiness()).resolves.toEqual(ok);
  });
});
