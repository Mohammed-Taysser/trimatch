import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SettingListSchema } from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Settings framework end-to-end (869e01dmv). A throwaway user keeps the seeded
// org untouched; `security.require2fa` is always reset to false so it never leaks
// into the other (serially-run) specs.
const PASSWORD = 'Demo123!';
let seq = 0;

describe('settings framework (869e01dmv)', () => {
  let app: INestApplication;
  let sequelize: Sequelize;
  let adminToken: string;
  let userToken: string;
  let userEmail: string;

  const http = () => request(app.getHttpServer());
  const setCompany = (key: string, value: unknown) =>
    http()
      .put(`/api/v1/settings/company/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value });
  const login = (email: string) =>
    http().post('/api/v1/auth/login').send({ email, password: PASSWORD });

  function findSetting(body: unknown, key: string) {
    return SettingListSchema.parse(body).find((s) => s.key === key);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    sequelize = app.get(Sequelize);
    adminToken = (await login('admin@demo').expect(200)).body.data.accessToken;

    userEmail = `settings-${Date.now().toString(36)}-${seq++}@demo`;
    await sequelize.query(
      `INSERT INTO users (id, email, full_name, password_hash, role, active, created_at, updated_at)
       VALUES (gen_random_uuid(), :email, 'Sam Settings', :hash, 'requester', true, now(), now())`,
      {
        replacements: { email: userEmail, hash: bcrypt.hashSync(PASSWORD, 4) },
        type: QueryTypes.INSERT,
      },
    );
    userToken = (await login(userEmail).expect(200)).body.data.accessToken;
  });

  afterAll(async () => {
    await setCompany('security.require2fa', false); // never leak the policy
    await app.close();
  });

  it('an admin sets and reads a company setting', async () => {
    const set = await setCompany('security.require2fa', true).expect(200);
    expect(set.body.data).toMatchObject({ key: 'security.require2fa', value: true });

    const list = await http()
      .get('/api/v1/settings/company')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(findSetting(list.body.data, 'security.require2fa')?.value).toBe(true);

    await setCompany('security.require2fa', false).expect(200);
  });

  it('company settings are admin-only', async () => {
    await http()
      .get('/api/v1/settings/company')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    await http()
      .put('/api/v1/settings/company/security.require2fa')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ value: true })
      .expect(403);
  });

  it('a user sets their own preference, which resolves over the company default', async () => {
    const before = await http()
      .get('/api/v1/settings/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(findSetting(before.body.data, 'notifications.emailEnabled')?.value).toBe(true); // default

    await http()
      .put('/api/v1/settings/me/notifications.emailEnabled')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ value: false })
      .expect(200);

    const after = await http()
      .get('/api/v1/settings/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(findSetting(after.body.data, 'notifications.emailEnabled')?.value).toBe(false);
  });

  it('rejects an unknown key (404), a wrong-scope write (400) and an invalid value (400)', async () => {
    const unknown = await setCompany('nope.unknown', true).expect(404);
    expect(unknown.body.code).toBe('SETTING_NOT_FOUND');

    const wrongScope = await http()
      .put('/api/v1/settings/me/security.require2fa')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ value: true })
      .expect(400);
    expect(wrongScope.body.code).toBe('SETTING_NOT_WRITABLE');

    const badValue = await setCompany('security.require2fa', 'yes').expect(400);
    expect(badValue.body.code).toBe('INVALID_SETTING_VALUE');
  });

  it('the company 2FA policy drives the login mustEnrollTwoFactor flag', async () => {
    await setCompany('security.require2fa', true).expect(200);
    const required = await login(userEmail).expect(200);
    expect(required.body.data.mustEnrollTwoFactor).toBe(true);
    expect(required.body.data.accessToken).toEqual(expect.any(String));

    await setCompany('security.require2fa', false).expect(200);
    const relaxed = await login(userEmail).expect(200);
    expect(relaxed.body.data.mustEnrollTwoFactor).toBeUndefined();
  });
});
