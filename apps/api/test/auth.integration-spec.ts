import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthUserSchema, LoginResponseSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed
// (demo users from runbook §1, password documented in the seeder).
const DEMO = { email: 'requester@demo', password: 'Demo123!' };

describe('demo users authenticate against the seeded database (AC 2/3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/login returns a JWT and the demo user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(DEMO)
      .expect(200);
    const parsed = LoginResponseSchema.parse(res.body);
    expect(parsed.user.email).toBe(DEMO.email);
    expect(parsed.user.role).toBe('requester');
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ ...DEMO, password: 'wrong' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a malformed body with 422 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEMO.email })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/auth/me without a token is 401 UNAUTHORIZED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/auth/me with the token resolves the same user', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(DEMO)
      .expect(200);
    const token = LoginResponseSchema.parse(login.body).accessToken;
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(AuthUserSchema.parse(res.body).email).toBe(DEMO.email);
  });
});
