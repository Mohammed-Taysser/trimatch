import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InboxSchema, RequisitionSchema } from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: 'Approval-flow test requisition',
  neededBy: '2026-09-01',
  currency: 'USD',
  lines: [{ description: 'Laptop', category: 'IT hardware', quantity: 1, unitPriceMinor: 99_00 }],
};

describe('approver inbox and decisions (FR-104 · TC-105)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
  let headToken: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  async function submittedRequisition(): Promise<{ reqId: string; stepId: string }> {
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
    const item = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${leadToken}`)
          .expect(200);
        return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
      },
      (i) => i.requisition.id === reqId,
    );
    if (!item) throw new Error('submitted requisition missing from approver inbox');
    return { reqId, stepId: item.stepId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    headToken = await login('head@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists pending steps with the requisition summary in the approver inbox', async () => {
    const { reqId } = await submittedRequisition();
    const item = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${leadToken}`)
          .expect(200);
        return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
      },
      (i) => i.requisition.id === reqId,
    );
    expect(item?.requisition).toMatchObject({
      requesterName: 'Riley Requester',
      totalMinor: 99_00,
      currency: 'USD',
    });
  });

  it('TC-105: reject without a reason → 422 REASON_REQUIRED', async () => {
    const { stepId } = await submittedRequisition();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${stepId}/reject`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({})
      .expect(422);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  it('reject with a reason → requisition rejected, requester sees the reason verbatim', async () => {
    const { reqId, stepId } = await submittedRequisition();
    const reason = 'Budget freeze until Q4 — please resubmit in October';
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${stepId}/reject`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ reason })
      .expect(204);

    const view = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${reqId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);
    const parsed = RequisitionSchema.parse(view.body.data);
    expect(parsed.status).toBe('rejected');
    expect(parsed.steps[0]).toMatchObject({
      status: 'rejected',
      reason,
      approverName: 'Lee Lead',
    });

    const audit = await app
      .get(Sequelize)
      .query(
        "SELECT action, comment FROM audit_log WHERE entity_id = :id AND action = 'requisition.rejected'",
        { replacements: { id: reqId }, type: QueryTypes.SELECT },
      );
    expect(audit).toEqual([expect.objectContaining({ comment: reason })]);
  });

  it('approve → requisition approved, audit row written', async () => {
    const { reqId, stepId } = await submittedRequisition();
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${stepId}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);

    const view = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${reqId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);
    expect(RequisitionSchema.parse(view.body.data).status).toBe('approved');

    const audit = await app
      .get(Sequelize)
      .query(
        "SELECT action FROM audit_log WHERE entity_id = :id AND action = 'requisition.approved'",
        { replacements: { id: reqId }, type: QueryTypes.SELECT },
      );
    expect(audit).toHaveLength(1);
  });

  it('an approver cannot act on a step assigned to someone else → 403', async () => {
    const { stepId } = await submittedRequisition();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${stepId}/approve`)
      .set('Authorization', `Bearer ${headToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('deciding an already-decided step → 409 INVALID_TRANSITION', async () => {
    const { stepId } = await submittedRequisition();
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${stepId}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${stepId}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('a requester role cannot access the inbox → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/approvals/inbox')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  describe('sequential multi-step chains (FR-502 · TC-503)', () => {
    // $600 → R2: [Team Lead, Department Head]
    const R2_DRAFT = {
      justification: 'Sequential chain test requisition',
      neededBy: '2026-12-20',
      currency: 'USD',
      lines: [
        { description: 'Desk pod', category: 'Furniture', quantity: 4, unitPriceMinor: 150_00 },
      ],
    };
    let headToken: string;

    beforeAll(async () => {
      headToken = await login('head@demo');
    });

    async function submitR2(): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/api/v1/requisitions')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send(R2_DRAFT)
        .expect(201);
      const reqId = created.body.data.id as string;
      await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${reqId}/submit`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      return reqId;
    }

    async function inboxItem(token: string, reqId: string) {
      return findAcrossPages(
        async (page) => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
          return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
        },
        (i) => i.requisition.id === reqId,
      );
    }

    it('step 2 is invisible and undecidable until step 1 approves', async () => {
      const reqId = await submitR2();
      // head (step 2) sees nothing yet
      expect(await inboxItem(headToken, reqId)).toBeUndefined();
      // lead (step 1) sees it
      const step1 = await inboxItem(leadToken, reqId);
      expect(step1?.stepNo).toBe(1);

      // approve step 1 → step 2 appears for head
      await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${step1?.stepId}/approve`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(204);
      const step2 = await inboxItem(headToken, reqId);
      expect(step2?.stepNo).toBe(2);

      // final approval → approved
      await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${step2?.stepId}/approve`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(204);
      const view = await request(app.getHttpServer())
        .get(`/api/v1/requisitions/${reqId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      expect(view.body.data.status).toBe('approved');
    });

    it('TC-503: step 1 approved, step 2 rejects → requisition rejected, chain stops', async () => {
      const reqId = await submitR2();
      const step1 = await inboxItem(leadToken, reqId);
      await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${step1?.stepId}/approve`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(204);
      const step2 = await inboxItem(headToken, reqId);
      await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${step2?.stepId}/reject`)
        .set('Authorization', `Bearer ${headToken}`)
        .send({ reason: 'Budget line exhausted for furniture' })
        .expect(204);

      const view = await request(app.getHttpServer())
        .get(`/api/v1/requisitions/${reqId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      expect(view.body.data.status).toBe('rejected');
      // chain stopped: nothing remains in anyone's inbox for this requisition
      expect(await inboxItem(leadToken, reqId)).toBeUndefined();
      expect(await inboxItem(headToken, reqId)).toBeUndefined();
    });

    it('acting out of turn → 409 STEP_NOT_CURRENT', async () => {
      const reqId = await submitR2();
      // find head's step id directly from the requisition view (not the inbox)
      const view = await request(app.getHttpServer())
        .get(`/api/v1/requisitions/${reqId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      const step2 = view.body.data.steps.find((s: { stepNo: number }) => s.stepNo === 2);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${step2.id}/approve`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(409);
      expect(res.body.code).toBe('STEP_NOT_CURRENT');
    });
  });

  describe('revise & resubmit (FR-105 · TC-106)', () => {
    it('TC-106: revise + resubmit → new round, previous round preserved in history', async () => {
      const { reqId, stepId } = await submittedRequisition();
      const reason = 'Wrong laptop model — spec the 16GB variant';
      await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${stepId}/reject`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ reason })
        .expect(204);

      // revise: rejected → draft, edit allowed again
      const revised = await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${reqId}/revise`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      expect(RequisitionSchema.parse(revised.body.data).status).toBe('draft');
      await request(app.getHttpServer())
        .put(`/api/v1/requisitions/${reqId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          ...DRAFT,
          lines: [
            {
              description: 'Laptop 16GB',
              category: 'IT hardware',
              quantity: 1,
              unitPriceMinor: 119_00,
            },
          ],
        })
        .expect(200);

      // resubmit: round 2 opens, round 1 stays in history with the reason
      const resubmitted = await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${reqId}/submit`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      const parsed = RequisitionSchema.parse(resubmitted.body.data);
      expect(parsed.status).toBe('pending_approval');
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.steps[0]).toMatchObject({ round: 1, status: 'rejected', reason });
      expect(parsed.steps[1]).toMatchObject({ round: 2, status: 'pending', reason: null });

      // round 2 is decidable: approve → approved
      const round2 = await findAcrossPages(
        async (page) => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
            .set('Authorization', `Bearer ${leadToken}`)
            .expect(200);
          return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
        },
        (i) => i.requisition.id === reqId && i.round === 2,
      );
      expect(round2).toBeDefined();
      await request(app.getHttpServer())
        .post(`/api/v1/approvals/steps/${round2?.stepId}/approve`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(204);
      const final = await request(app.getHttpServer())
        .get(`/api/v1/requisitions/${reqId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      expect(RequisitionSchema.parse(final.body.data).status).toBe('approved');
    });

    it('revising a non-rejected requisition → 409 INVALID_TRANSITION', async () => {
      const { reqId } = await submittedRequisition();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/requisitions/${reqId}/revise`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });
  });
});
