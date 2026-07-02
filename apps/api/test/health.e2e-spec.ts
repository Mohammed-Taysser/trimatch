import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthLivenessSchema, HealthReadinessSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

describe('api starts and serves /api/v1 health (AC 1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgres://trimatch:trimatch@localhost:5432/trimatch';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/liveness returns a body matching the shared schema', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .expect(200);
    const parsed = HealthLivenessSchema.parse(res.body);
    expect(parsed.service).toBe('trimatch-api');
  });

  it('GET /api/v1/health/readiness reports postgres and redis checks', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/readiness');
    // 200 when docker compose is up, 503 (degraded) otherwise — both bodies
    // must match the shared schema.
    expect([200, 503]).toContain(res.status);
    const parsed = HealthReadinessSchema.parse(res.body);
    expect(typeof parsed.checks.postgres).toBe('boolean');
    expect(typeof parsed.checks.redis).toBe('boolean');
  });
});
