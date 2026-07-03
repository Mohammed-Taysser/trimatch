import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthLivenessSchema, HealthReadinessSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp, setupOpenApi } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate (see runbook §1).
describe('api boots against real infrastructure and serves /api/v1 health (AC 1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    setupOpenApi(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/liveness is public and matches the shared schema', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);
    expect(HealthLivenessSchema.parse(res.body.data).service).toBe('trimatch-api');
  });

  it('GET /api/v1/health/readiness reports postgres, redis and the queue as reachable', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/readiness').expect(200);
    expect(HealthReadinessSchema.parse(res.body.data)).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true, queue: true },
    });
  });

  it('echoes a caller-provided X-Request-Id and generates one otherwise', async () => {
    const echoed = await request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .set('X-Request-Id', 'trace-me-123')
      .expect(200);
    expect(echoed.headers['x-request-id']).toBe('trace-me-123');

    const generated = await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('GET /api/docs-json serves the OpenAPI document with the auth routes (ADR-0003)', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.info.title).toBe('TriMatch API');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/auth/login', '/api/v1/auth/me']),
    );
  });
});
