import { ServiceUnavailableException } from '@nestjs/common';
import { SequelizeHealthIndicator } from '@nestjs/terminus';
import { Sequelize } from 'sequelize-typescript';
import { QueueHealth } from '../notifications/queue-health.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

// Terminus does the real DB ping (throws on failure); QueueHealth does the real
// Redis PING and the queue-connection readiness. The service maps all three to
// the unchanged { status, checks } contract.
function serviceWith(pg: boolean, redis: boolean, queue: boolean): HealthService {
  const db = {
    pingCheck: pg
      ? jest.fn().mockResolvedValue({ postgres: { status: 'up' } })
      : jest.fn().mockRejectedValue(new Error('db down')),
  } as unknown as SequelizeHealthIndicator;
  const queueHealth = {
    pingRedis: () => Promise.resolve(redis),
    isReady: () => Promise.resolve(queue),
  } as unknown as QueueHealth;
  return new HealthService(db, {} as Sequelize, queueHealth);
}

describe('readiness pings postgres, redis and the queue at the driver level', () => {
  it('is ok when every driver ping succeeds', async () => {
    const result = await serviceWith(true, true, true).readiness();
    expect(result).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true, queue: true },
    });
  });

  it('is degraded when the postgres ping throws', async () => {
    const result = await serviceWith(false, true, true).readiness();
    expect(result).toEqual({
      status: 'degraded',
      checks: { postgres: false, redis: true, queue: true },
    });
  });

  it('is degraded when redis does not answer PING', async () => {
    const result = await serviceWith(true, false, true).readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toBe(false);
  });

  it('is degraded when the queue connection is not ready', async () => {
    const result = await serviceWith(true, true, false).readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks.queue).toBe(false);
  });

  it('liveness reports the service is up with uptime', () => {
    const liveness = serviceWith(true, true, true).liveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.service).toBe('trimatch-api');
    expect(typeof liveness.uptimeSeconds).toBe('number');
    expect(typeof liveness.timestamp).toBe('string');
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
