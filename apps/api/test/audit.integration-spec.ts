import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InboxSchema } from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: 'Audit-trail test requisition',
  neededBy: '2026-09-15',
  currency: 'USD',
  lines: [{ description: 'Chair', category: 'Furniture', quantity: 1, unitPriceMinor: 45_00 }],
};

describe('immutable audit trail (FR-106 · NFR-01 · TC-901)', () => {
  let app: INestApplication;
  let sequelize: Sequelize;
  let requesterToken: string;
  let leadToken: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function stepFor(reqId: string): Promise<string> {
    const inbox = await request(app.getHttpServer())
      .get('/api/v1/approvals/inbox')
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(200);
    const item = InboxSchema.parse(inbox.body).find((i) => i.requisition.id === reqId);
    if (!item) throw new Error('step not found in inbox');
    return item.stepId;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    sequelize = app.get(Sequelize);
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-901: every transition writes exactly one row (who/when/from/to/comment)', async () => {
    const auth = { Authorization: `Bearer ${requesterToken}` };
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set(auth)
      .send(DRAFT)
      .expect(201);
    const reqId = created.body.id as string;

    // submit → reject → revise → resubmit → approve
    await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${reqId}/submit`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${await stepFor(reqId)}/reject`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ reason: 'needs a cheaper option' })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${reqId}/revise`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${reqId}/submit`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${await stepFor(reqId)}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);

    const rows = await sequelize.query<{
      action: string;
      from_state: string;
      to_state: string;
      actor_id: string;
      comment: string | null;
      created_at: Date;
    }>('SELECT * FROM audit_log WHERE entity_id = :id ORDER BY created_at ASC', {
      replacements: { id: reqId },
      type: QueryTypes.SELECT,
    });

    expect(rows.map((r) => [r.action, r.from_state, r.to_state])).toEqual([
      ['requisition.submitted', 'draft', 'pending_approval'],
      ['requisition.rejected', 'pending_approval', 'rejected'],
      ['requisition.revised', 'rejected', 'draft'],
      ['requisition.submitted', 'draft', 'pending_approval'],
      ['requisition.approved', 'pending_approval', 'approved'],
    ]);
    expect(rows[1].comment).toBe('needs a cheaper option');
    for (const row of rows) {
      expect(row.actor_id).toBeTruthy();
      expect(row.created_at).toBeTruthy();
    }
  });

  it('audit rows cannot be updated (I-7, database-enforced)', async () => {
    await expect(
      sequelize.query("UPDATE audit_log SET comment = 'tampered' WHERE true"),
    ).rejects.toThrow(/append-only/);
  });

  it('audit rows cannot be deleted (I-7, database-enforced)', async () => {
    await expect(sequelize.query('DELETE FROM audit_log WHERE true')).rejects.toThrow(
      /append-only/,
    );
  });
});
