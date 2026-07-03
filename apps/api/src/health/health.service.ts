import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthLiveness,
  HealthLivenessSchema,
  HealthReadiness,
  HealthReadinessSchema,
} from '@trimatch/shared';
import { connect } from 'node:net';
import { QueueHealth } from '../notifications/queue-health.service';

// Plain TCP reachability until Sequelize/BullMQ land (Epic 1) — readiness then
// upgrades to real driver pings without changing the contract.
function checkTcp(url: string, defaultPort: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    const socket = connect({
      host: parsed.hostname,
      port: Number(parsed.port) || defaultPort,
    });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly queue: QueueHealth,
  ) {}

  liveness(): HealthLiveness {
    return HealthLivenessSchema.parse({
      status: 'ok',
      service: 'trimatch-api',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  async readiness(): Promise<HealthReadiness> {
    const [postgres, redis, queue] = await Promise.all([
      checkTcp(this.config.getOrThrow<string>('DATABASE_URL'), 5432),
      checkTcp(this.config.getOrThrow<string>('REDIS_URL'), 6379),
      this.queue.isReady(),
    ]);
    return HealthReadinessSchema.parse({
      status: postgres && redis && queue ? 'ok' : 'degraded',
      checks: { postgres, redis, queue },
    });
  }
}
