import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MatrixRulesetSchema, RequisitionSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { approveAcrossChain } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

// $7,200 lands in R3 under the default ruleset → Team Lead, Department Head,
// Finance Director (three steps).
const DRAFT = {
  justification: 'Chain-immunity test requisition',
  neededBy: '2026-09-01',
  currency: 'USD',
  lines: [
    { description: 'Rack servers', category: 'IT hardware', quantity: 2, unitPriceMinor: 3_600_00 },
  ],
};

describe('in-flight chains are immune to rule edits (FR-504 · TC-505 · I-5)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
  let headToken: string;
  let findirToken: string;
  let adminToken: string;
  let defaultRules: unknown[];

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  async function submit(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send(DRAFT)
      .expect(201);
    const reqId = created.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${reqId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);
    return reqId;
  }

  async function stepsOf(reqId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${reqId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);
    return RequisitionSchema.parse(res.body.data).steps;
  }

  async function publishRuleset(rules: unknown[]): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rules })
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    headToken = await login('head@demo');
    findirToken = await login('findir@demo');
    adminToken = await login('admin@demo');

    const active = await request(app.getHttpServer())
      .get('/api/v1/matrix-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    defaultRules = MatrixRulesetSchema.parse(active.body.data).rules.map((r) => ({
      ruleLabel: r.ruleLabel,
      kind: r.kind,
      minAmountMinor: r.minAmountMinor,
      maxAmountMinor: r.maxAmountMinor,
      department: r.department,
      category: r.category,
      chain: r.chain,
    }));
  });

  afterAll(async () => {
    // whatever happened above, leave the default R1–R5 ruleset active
    await publishRuleset(defaultRules);
    await app.close();
  });

  it('TC-505: editing the matrix leaves in-flight chains untouched; new submissions use the new rules', async () => {
    const inFlightId = await submit();
    const before = await stepsOf(inFlightId);
    expect(before.map((s) => s.stepNo)).toEqual([1, 2, 3]); // R3: Lead, Head, FinDir

    // Admin publishes v(n+1): every amount now needs only the Team Lead.
    await publishRuleset([
      {
        ruleLabel: 'R1',
        kind: 'base',
        minAmountMinor: 0,
        maxAmountMinor: null,
        department: null,
        category: null,
        chain: ['Team Lead'],
      },
    ]);

    // The in-flight chain is byte-for-byte the snapshot taken at submission.
    const after = await stepsOf(inFlightId);
    expect(after.map((s) => ({ id: s.id, stepNo: s.stepNo, approverId: s.approverId }))).toEqual(
      before.map((s) => ({ id: s.id, stepNo: s.stepNo, approverId: s.approverId })),
    );

    // …and the requisition completes along that old three-step chain.
    await approveAcrossChain(app.getHttpServer(), [leadToken, headToken, findirToken], inFlightId);
    const done = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${inFlightId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);
    expect(done.body.data.status).toBe('approved');

    // An identical requisition submitted now snapshots the NEW single-step rule.
    const freshId = await submit();
    const fresh = await stepsOf(freshId);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].approverName).toBe('Lee Lead');
  });
});
