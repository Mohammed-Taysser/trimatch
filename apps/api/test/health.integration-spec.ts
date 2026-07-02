import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthLivenessSchema, HealthReadinessSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate (see runbook §1).
describe('api boots against real infrastructure and serves /api/v1 health (AC 1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/liveness is public and matches the shared schema', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);
    expect(HealthLivenessSchema.parse(res.body).service).toBe('trimatch-api');
  });

  it('GET /api/v1/health/readiness reports postgres and redis as reachable', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/readiness').expect(200);
    expect(HealthReadinessSchema.parse(res.body)).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true },
    });
  });
});
