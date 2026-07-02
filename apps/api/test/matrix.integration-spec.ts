import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MatrixRulesetSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

describe('matrix rules as validated, versioned data (FR-501/505 · TC-506)', () => {
  let app: INestApplication;
  let adminToken: string;
  let requesterToken: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    adminToken = await login('admin@demo');
    requesterToken = await login('requester@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('the seeded default ruleset R1–R5 is active', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const ruleset = MatrixRulesetSchema.parse(res.body.data);
    expect(ruleset.version).toBeGreaterThanOrEqual(1);
    const labels = ruleset.rules.map((r) => r.ruleLabel);
    for (const label of ['R1', 'R2', 'R3', 'R4', 'R5']) {
      expect(labels).toContain(label);
    }
    const r5 = ruleset.rules.find((r) => r.ruleLabel === 'R5');
    expect(r5).toMatchObject({ kind: 'append', department: 'IT', chain: ['CISO'] });
    const r2 = ruleset.rules.find((r) => r.ruleLabel === 'R2');
    expect(r2).toMatchObject({ minAmountMinor: 500_01, maxAmountMinor: 5_000_00 });
  });

  it('TC-506: overlapping ranges in one scope → 422 MATRIX_OVERLAP', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rules: [
          {
            ruleLabel: 'R1',
            kind: 'base',
            minAmountMinor: 0,
            maxAmountMinor: 500_00,
            department: null,
            category: null,
            chain: ['Team Lead'],
          },
          {
            ruleLabel: 'R2',
            kind: 'base',
            minAmountMinor: 500_00, // overlaps R1 on the boundary cent
            maxAmountMinor: 5_000_00,
            department: null,
            category: null,
            chain: ['Team Lead', 'Department Head'],
          },
        ],
      })
      .expect(422);
    expect(res.body.code).toBe('MATRIX_OVERLAP');
    expect(res.body.details[0].message).toContain('R1');
  });

  it('a valid ruleset becomes the next active version; old versions stay', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeVersion = before.body.data.version as number;

    const res = await request(app.getHttpServer())
      .post('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rules: [
          {
            ruleLabel: 'R1',
            kind: 'base',
            minAmountMinor: 0,
            maxAmountMinor: 1_000_00,
            department: null,
            category: null,
            chain: ['Team Lead'],
          },
          {
            ruleLabel: 'R2',
            kind: 'base',
            minAmountMinor: 1_000_01,
            maxAmountMinor: null,
            department: null,
            category: null,
            chain: ['Team Lead', 'Department Head'],
          },
        ],
      })
      .expect(201);
    const ruleset = MatrixRulesetSchema.parse(res.body.data);
    expect(ruleset.version).toBe(beforeVersion + 1);
    expect(ruleset.rules).toHaveLength(2);

    // restore the default ruleset as the active version so chain computation
    // (and other suites) keep working against R1–R5
    const defaults = MatrixRulesetSchema.parse(before.body.data).rules.map((r) => ({
      ruleLabel: r.ruleLabel,
      kind: r.kind,
      minAmountMinor: r.minAmountMinor,
      maxAmountMinor: r.maxAmountMinor,
      department: r.department,
      category: r.category,
      chain: r.chain,
    }));
    await request(app.getHttpServer())
      .post('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rules: defaults })
      .expect(201);
  });

  it('non-admins cannot read or write matrix rules → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);
    const res = await request(app.getHttpServer())
      .post('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ rules: [] })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
