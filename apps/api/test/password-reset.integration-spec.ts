import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OUTBOUND_CHANNEL } from '../src/notifications/outbound/outbound-channel';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
// Overrides the outbound channel with a spy so the test can read the delivered
// OTP (never exposed by the API). Uses requester2@demo and restores its seed
// password afterward so other specs keep working.
const USER = 'requester2@demo';
const SEED_PASSWORD = 'Demo123!';

describe('self-service password reset (Epic 16)', () => {
  let app: INestApplication;
  let lastCode: string | undefined;

  const spyChannel = {
    name: 'test-spy',
    deliver: jest.fn().mockResolvedValue(undefined),
    deliverPasswordReset: jest.fn((reset: { code: string }) => {
      lastCode = reset.code;
      return Promise.resolve();
    }),
  };

  function forgot(email: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email });
  }
  function reset(email: string, code: string, newPassword: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ email, code, newPassword });
  }
  function login(email: string, password: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  }

  async function issueCode(email: string): Promise<string> {
    lastCode = undefined;
    await forgot(email).expect(200);
    if (!lastCode) throw new Error('no OTP was delivered');
    return lastCode;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OUTBOUND_CHANNEL)
      .useValue(spyChannel)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    // Restore the seed password no matter how the test ended.
    try {
      const code = await issueCode(USER);
      await reset(USER, code, SEED_PASSWORD);
    } catch {
      // best effort
    }
    await app.close();
  });

  it('does not reveal whether an account exists', async () => {
    lastCode = undefined;
    const known = await forgot(USER).expect(200);
    const knownDelivered = lastCode !== undefined;

    lastCode = undefined;
    const unknown = await forgot('does-not-exist@demo').expect(200);
    const unknownDelivered = lastCode !== undefined;

    // Same status + payload for both — only the per-request requestId/timestamp
    // differ, which leak nothing.
    expect(known.status).toBe(unknown.status);
    expect(known.body.data).toEqual({ ok: true });
    expect(unknown.body.data).toEqual({ ok: true });
    expect(knownDelivered).toBe(true);
    expect(unknownDelivered).toBe(false); // no OTP created/sent for an unknown email
  });

  it('resets the password with the OTP, and the code is single-use', async () => {
    const code = await issueCode(USER);

    await reset(USER, code, 'Reset123!').expect(200);
    await login(USER, 'Reset123!').expect(200); // rotation took effect
    await login(USER, SEED_PASSWORD).expect(401); // old password no longer works

    // Reusing the same (now-used) code is rejected.
    const reused = await reset(USER, code, 'Another1!').expect(401);
    expect(reused.body.code).toBe('INVALID_RESET');
  });

  it('rejects a wrong code', async () => {
    await issueCode(USER);
    const res = await reset(USER, '000000', 'Whatever1!').expect(401);
    expect(res.body.code).toBe('INVALID_RESET');
  });
});
