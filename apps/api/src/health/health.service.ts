import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { SequelizeHealthIndicator } from '@nestjs/terminus';
import {
  HealthLiveness,
  HealthLivenessSchema,
  HealthReadiness,
  HealthReadinessSchema,
} from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import { QueueHealth } from '../notifications/queue-health.service';

// Readiness uses real driver-level pings (869dzr3jw): a Sequelize `SELECT 1` via
// @nestjs/terminus and a Redis PING over BullMQ's connection — reachability that
// a plain TCP probe couldn't prove. The response contract is unchanged.
@Injectable()
export class HealthService {
  constructor(
    private readonly db: SequelizeHealthIndicator,
    @InjectConnection() private readonly sequelize: Sequelize,
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
      this.pingPostgres(),
      this.queue.pingRedis(),
      this.queue.isReady(),
    ]);
    return HealthReadinessSchema.parse({
      status: postgres && redis && queue ? 'ok' : 'degraded',
      checks: { postgres, redis, queue },
    });
  }

  // Terminus throws on a failed/slow ping; a degraded check is a boolean here,
  // not a 503 — the controller decides the status code from the aggregate.
  private async pingPostgres(): Promise<boolean> {
    try {
      await this.db.pingCheck('postgres', { connection: this.sequelize, timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  }
}
