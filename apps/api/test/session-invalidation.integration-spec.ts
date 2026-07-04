import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Session invalidation via token versioning (869dzymvv): a well-signed JWT is
// only live while its `tv` claim matches the user's current token_version, which
// is bumped on password change/reset and on deactivation.
// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

let seq = 0;

describe('session invalidation via token versioning (869dzymvv)', () => {
  let app: INestApplication;
  let sequelize: Sequelize;
  let adminToken: string;

  async function login(email: string, password = PASSWORD): Promise<{ token: string; id: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  function me(token: string) {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
  }

  // Throwaway users so revoking their sessions never disturbs the seeded org.
  async function insertUser(): Promise<{ id: string; email: string }> {
    const email = `si-${Date.now().toString(36)}-${seq++}@demo`;
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO users (id, email, full_name, password_hash, role, active, created_at, updated_at)
       VALUES (gen_random_uuid(), :email, 'Sessie Session', :hash, 'requester', true, now(), now())
       RETURNING id`,
      {
        replacements: { email, hash: bcrypt.hashSync(PASSWORD, 4) },
        type: QueryTypes.SELECT,
      },
    );
    return { id: rows[0].id, email };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    sequelize = app.get(Sequelize);
    adminToken = (await login('admin@demo')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a current token resolves /me (guard baseline)', async () => {
    const user = await insertUser();
    const { token } = await login(user.email);
    const res = await me(token).expect(200);
    expect(res.body.data.email).toBe(user.email);
  });

  it('changing the password revokes the current session, and a fresh login works', async () => {
    const user = await insertUser();
    const { token } = await login(user.email);
    await me(token).expect(200); // live before the change

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'BrandNew1!' })
      .expect(200);

    // the very token that made the change is now dead
    const revoked = await me(token).expect(401);
    expect(revoked.body.code).toBe('TOKEN_REVOKED');

    // a fresh login with the new password issues a token at the new version
    const { token: fresh } = await login(user.email, 'BrandNew1!');
    await me(fresh).expect(200);
  });

  it('deactivating a user kills their existing session immediately', async () => {
    const user = await insertUser();
    const { token } = await login(user.email);
    await me(token).expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(200);

    const dead = await me(token).expect(401);
    expect(dead.body.code).toBe('ACCOUNT_DEACTIVATED');
  });
});
