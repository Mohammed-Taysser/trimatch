import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d (Redis-backed throttler).
// The rest of the suite runs with high limits (many logins from one IP); this
// spec overrides the throttler options directly (DI level) to a low limit so the
// login endpoint 429s deterministically, then asserts the fixed error envelope.
const THROTTLER_OPTIONS = 'THROTTLER:MODULE_OPTIONS';

describe('rate limiting on credential endpoints (Epic 16)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(THROTTLER_OPTIONS)
      .useValue({ throttlers: [{ name: 'test', ttl: 60_000, limit: 3 }] })
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 in the fixed envelope once the login limit is exceeded', async () => {
    const server = app.getHttpServer();
    let throttled: request.Response | undefined;
    for (let attempt = 0; attempt < 8 && !throttled; attempt++) {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@demo', password: 'wrong-password' });
      if (res.status === 429) throttled = res;
    }
    expect(throttled).toBeDefined();
    expect(throttled?.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(typeof throttled?.body.message).toBe('string');
    expect(typeof throttled?.body.requestId).toBe('string');
    expect(typeof throttled?.body.timestamp).toBe('string');
  });
});
