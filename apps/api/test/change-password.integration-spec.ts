import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
// Changes requester2@demo's password and restores the seed password afterward so
// other specs keep working.
const USER = 'requester2@demo';
const SEED_PASSWORD = 'Demo123!';
const NEW_PASSWORD = 'Changed1!';

describe('authenticated password change (Epic 16)', () => {
  let app: INestApplication;

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  }
  function changePassword(token: string, currentPassword: string, newPassword: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword, newPassword });
  }
  async function tokenFor(password: string): Promise<string> {
    const res = await login(USER, password).expect(200);
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    // Restore the seed password whatever state the test left it in.
    for (const current of [NEW_PASSWORD, SEED_PASSWORD]) {
      const res = await login(USER, current);
      if (res.status === 200) {
        await changePassword(res.body.data.accessToken, current, SEED_PASSWORD);
        break;
      }
    }
    await app.close();
  });

  it('rotates the password after verifying the current one', async () => {
    const token = await tokenFor(SEED_PASSWORD);
    await changePassword(token, SEED_PASSWORD, NEW_PASSWORD).expect(200);

    await login(USER, NEW_PASSWORD).expect(200); // new password works
    await login(USER, SEED_PASSWORD).expect(401); // old password no longer works
  });

  it('rejects a wrong current password without rotating', async () => {
    const token = await tokenFor(NEW_PASSWORD);
    const res = await changePassword(token, 'not-my-password', 'Whatever1!').expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    await login(USER, NEW_PASSWORD).expect(200); // unchanged
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
