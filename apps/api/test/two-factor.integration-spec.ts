import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoginResponseSchema, TwoFactorSetupResponseSchema } from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Optional TOTP 2FA end-to-end (869dzycut). Uses a throwaway user so enabling
// 2FA never disturbs the seeded users other specs authenticate as.
// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
let seq = 0;

describe('optional TOTP two-factor auth (869dzycut)', () => {
  let app: INestApplication;
  let sequelize: Sequelize;
  let email: string;
  let token: string;
  let secret: string;
  let recoveryCodes: string[];

  const http = () => request(app.getHttpServer());

  function login(body: { email: string; password: string }) {
    return http().post('/api/v1/auth/login').send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    sequelize = app.get(Sequelize);

    email = `2fa-${Date.now().toString(36)}-${seq++}@demo`;
    await sequelize.query(
      `INSERT INTO users (id, email, full_name, password_hash, role, active, created_at, updated_at)
       VALUES (gen_random_uuid(), :email, 'Tessa Twofactor', :hash, 'requester', true, now(), now())`,
      { replacements: { email, hash: bcrypt.hashSync(PASSWORD, 4) }, type: QueryTypes.INSERT },
    );
    token = (await login({ email, password: PASSWORD })).body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('enrols: setup returns an otpauth URI + secret, enable returns recovery codes', async () => {
    const setup = await http()
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const parsed = TwoFactorSetupResponseSchema.parse(setup.body.data);
    expect(parsed.otpauthUri).toMatch(/^otpauth:\/\/totp\/.*TriMatch/);
    secret = parsed.secret;

    const enable = await http()
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);
    recoveryCodes = enable.body.data.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(10);
  });

  it('login now returns a challenge, exchanged for a session at /2fa/verify', async () => {
    const challenged = await login({ email, password: PASSWORD }).expect(200);
    expect(challenged.body.data.twoFactorRequired).toBe(true);
    expect(challenged.body.data.accessToken).toBeUndefined();
    const challenge = challenged.body.data.challenge as string;

    // the challenge itself cannot reach a protected route
    await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${challenge}`).expect(401);

    const verified = await http()
      .post('/api/v1/auth/2fa/verify')
      .send({ challenge, code: authenticator.generate(secret) })
      .expect(200);
    const session = LoginResponseSchema.parse(verified.body.data);
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
  });

  it('a recovery code also satisfies the challenge (single use)', async () => {
    const challenge = (await login({ email, password: PASSWORD }).expect(200)).body.data
      .challenge as string;
    const recovery = recoveryCodes[0];

    await http().post('/api/v1/auth/2fa/verify').send({ challenge, code: recovery }).expect(200);

    // the same recovery code cannot be reused
    const fresh = (await login({ email, password: PASSWORD }).expect(200)).body.data
      .challenge as string;
    const reused = await http()
      .post('/api/v1/auth/2fa/verify')
      .send({ challenge: fresh, code: recovery })
      .expect(401);
    expect(reused.body.code).toBe('INVALID_TWO_FACTOR_CODE');
  });

  it('rejects a wrong TOTP code at verify', async () => {
    const challenge = (await login({ email, password: PASSWORD }).expect(200)).body.data
      .challenge as string;
    const res = await http()
      .post('/api/v1/auth/2fa/verify')
      .send({ challenge, code: '000000' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_TWO_FACTOR_CODE');
  });

  it('disable turns 2FA off; login returns a session again', async () => {
    // a fresh session (2FA is on, so log in via the challenge) to authorise disable
    const challenge = (await login({ email, password: PASSWORD }).expect(200)).body.data
      .challenge as string;
    const session = (
      await http()
        .post('/api/v1/auth/2fa/verify')
        .send({ challenge, code: authenticator.generate(secret) })
        .expect(200)
    ).body.data.accessToken as string;

    await http()
      .post('/api/v1/auth/2fa/disable')
      .set('Authorization', `Bearer ${session}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);

    const plain = await login({ email, password: PASSWORD }).expect(200);
    expect(LoginResponseSchema.parse(plain.body.data).accessToken).toEqual(expect.any(String));
  });
});
