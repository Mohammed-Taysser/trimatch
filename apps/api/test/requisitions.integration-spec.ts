import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequisitionSchema } from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const TWO_LINES = {
  justification: 'Two new monitors for the design team',
  neededBy: '2026-08-01',
  currency: 'USD',
  lines: [
    { description: '27" monitor', category: 'IT hardware', quantity: 2, unitPriceMinor: 15_00 },
    { description: 'HDMI cable', category: 'IT hardware', quantity: 3, unitPriceMinor: 9_99 },
  ],
};

describe('draft requisitions (FR-101/102 · TC-101..103)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

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
    tokenA = await login('requester@demo');
    tokenB = await login('requester2@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-101: requester creates a requisition with 2 lines → draft, totals in minor units', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    const req = RequisitionSchema.parse(res.body.data);
    expect(req.status).toBe('draft');
    expect(req.totalMinor).toBe(59_97);
    expect(req.lines.map((l) => l.lineTotalMinor)).toEqual([30_00, 29_97]);
    expect(req.lines.map((l) => l.lineNo)).toEqual([1, 2]);
  });

  it('TC-102: create with 0 lines → 422 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...TWO_LINES, lines: [] })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('TC-103: user B edits or deletes user A draft → 403 FORBIDDEN', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    const id = created.body.data.id as string;

    const edit = await request(app.getHttpServer())
      .put(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send(TWO_LINES)
      .expect(403);
    expect(edit.body.code).toBe('FORBIDDEN');

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
    expect(del.body.code).toBe('FORBIDDEN');
  });

  it('owner edits a draft → totals recomputed; owner deletes → gone', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    const id = created.body.data.id as string;

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...TWO_LINES,
        lines: [
          { description: 'Desk', category: 'Furniture', quantity: 1, unitPriceMinor: 120_00 },
        ],
      })
      .expect(200);
    expect(RequisitionSchema.parse(updated.body.data).totalMinor).toBe(120_00);

    await request(app.getHttpServer())
      .delete(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
    const gone = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(gone.body.code).toBe('NOT_FOUND');
  });

  it('TC-108/FR-107: the list shows live state and the pending approver', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${created.body.data.id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const item = (list.body.data as { id: string }[]).find((r) => r.id === created.body.data.id);
    const parsed = RequisitionSchema.parse(item);
    expect(parsed.status).toBe('pending_approval');
    const pending = parsed.steps.find((s) => s.status === 'pending');
    expect(pending?.approverName).toBe('Lee Lead');
  });

  it('list returns only the requesting user own requisitions', async () => {
    const mine = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(TWO_LINES)
      .expect(201);
    const listA = await request(app.getHttpServer())
      .get('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const idsA = (listA.body.data as { id: string }[]).map((r) => r.id);
    expect(idsA).not.toContain(mine.body.data.id);
  });

  it('a non-requester role cannot create requisitions (403)', async () => {
    const approverToken = await login('lead@demo');
    const res = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${approverToken}`)
      .send(TWO_LINES)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  describe('submit for approval (FR-103 · TC-104/TC-107)', () => {
    async function createDraft(token: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requisitions')
        .set('Authorization', `Bearer ${token}`)
        .send(TWO_LINES)
        .expect(201);
      return res.body.data.id as string;
    }

    it('TC-104: submit → pending_approval, chain snapshotted, audit row written', async () => {
      const id = await createDraft(tokenA);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${id}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(RequisitionSchema.parse(res.body.data).status).toBe('pending_approval');

      const sequelize = app.get(Sequelize);
      const steps = await sequelize.query(
        'SELECT round, step_no, status, approver_id FROM approval_steps WHERE requisition_id = :id',
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      expect(steps).toEqual([
        expect.objectContaining({
          round: 1,
          step_no: 1,
          status: 'pending',
          // lead@demo is requester@demo's manager in the seed
          approver_id: '019787c8-0000-4000-8000-000000000002',
        }),
      ]);

      const audit = await sequelize.query(
        'SELECT action, from_state, to_state, actor_id FROM audit_log WHERE entity_id = :id',
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      expect(audit).toEqual([
        expect.objectContaining({
          action: 'requisition.submitted',
          from_state: 'draft',
          to_state: 'pending_approval',
          actor_id: '019787c8-0000-4000-8000-000000000001',
        }),
      ]);
    });

    it('TC-107: submitting a non-draft again → 409 INVALID_TRANSITION', async () => {
      const id = await createDraft(tokenA);
      await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${id}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const again = await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${id}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(409);
      expect(again.body.code).toBe('INVALID_TRANSITION');
    });

    it('editing a submitted requisition → 409 INVALID_TRANSITION', async () => {
      const id = await createDraft(tokenA);
      await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${id}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const edit = await request(app.getHttpServer())
        .put(`/api/v1/requisitions/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(TWO_LINES)
        .expect(409);
      expect(edit.body.code).toBe('INVALID_TRANSITION');
    });

    it('user B cannot submit user A draft → 403 FORBIDDEN', async () => {
      const id = await createDraft(tokenA);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${id}/submit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('a requester without a manager gets 409 NO_APPROVER', async () => {
      const id = await createDraft(tokenB);
      const sequelize = app.get(Sequelize);
      await sequelize.query("UPDATE users SET manager_id = NULL WHERE email = 'requester2@demo'");
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/requisitions/${id}/submit`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(409);
        expect(res.body.code).toBe('NO_APPROVER');
      } finally {
        await sequelize.query(
          "UPDATE users SET manager_id = '019787c8-0000-4000-8000-000000000002' WHERE email = 'requester2@demo'",
        );
      }
    });
  });
});
