import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Notification, NotificationListSchema, NotificationType } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { approveAcrossChain, findAcrossPages } from './helpers';
import { InboxSchema } from '@trimatch/shared';

// Real infrastructure required: docker compose up -d && migrate && seed.
// Emission is async (enqueue → worker persists), so recipient checks poll.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: 'Notification hand-off test requisition',
  neededBy: '2026-10-01',
  currency: 'USD',
  lines: [{ description: 'Widget', category: 'Parts', quantity: 100, unitPriceMinor: 50_00 }],
};

describe('notifications are emitted on every workflow hand-off (Epic 9)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
  let headToken: string;
  let findirToken: string;
  let purchasingToken: string;
  let warehouseToken: string;
  let apToken: string;
  let vendorId: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  function notifications(token: string): Promise<Notification[]> {
    return request(app.getHttpServer())
      .get('/api/v1/notifications?pageSize=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((res) => NotificationListSchema.parse(res.body.data));
  }

  // Poll the recipient's feed until the expected (type, entity) notification
  // lands (the worker persists asynchronously) or the attempts run out.
  async function waitForNotification(
    token: string,
    type: NotificationType,
    entityId: string,
  ): Promise<Notification | undefined> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const hit = (await notifications(token)).find(
        (n) => n.type === type && n.entityId === entityId,
      );
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  async function submitRequisition(): Promise<string> {
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

  async function pendingStepFor(token: string, reqId: string): Promise<string> {
    const item = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
      },
      (i) => i.requisition.id === reqId,
    );
    if (!item) throw new Error(`no pending step for ${reqId} in this inbox`);
    return item.stepId;
  }

  async function issuedPo(): Promise<{ poId: string; poLineId: string; reqId: string }> {
    const reqId = await submitRequisition();
    await approveAcrossChain(app.getHttpServer(), [leadToken, headToken, findirToken], reqId);
    const converted = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: reqId, vendorId })
      .expect(201);
    const poId = converted.body.data.id as string;
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poId}/issue`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    return { poId, poLineId: issued.body.data.lines[0].id as string, reqId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    headToken = await login('head@demo');
    findirToken = await login('findir@demo');
    purchasingToken = await login('purchasing@demo');
    warehouseToken = await login('warehouse@demo');
    apToken = await login('ap@demo');

    const vendor = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: `Notify Supplies ${Date.now().toString(36)}`,
        contactEmail: 'notify@vendor.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    vendorId = vendor.body.data.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requisition submitted → the first approver, not the requester', async () => {
    const reqId = await submitRequisition();
    const forLead = await waitForNotification(leadToken, 'requisition.submitted', reqId);
    expect(forLead).toBeDefined();
    // the requester is never told their own requisition was "submitted for approval"
    const requesterHas = (await notifications(requesterToken)).some(
      (n) => n.type === 'requisition.submitted' && n.entityId === reqId,
    );
    expect(requesterHas).toBe(false);
  });

  it('step approved → the next approver in the chain', async () => {
    const reqId = await submitRequisition();
    const leadStep = await pendingStepFor(leadToken, reqId);
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${leadStep}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);
    const forHead = await waitForNotification(headToken, 'requisition.submitted', reqId);
    expect(forHead).toBeDefined();
  });

  it('requisition rejected → the requester', async () => {
    const reqId = await submitRequisition();
    const leadStep = await pendingStepFor(leadToken, reqId);
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${leadStep}/reject`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ reason: 'Out of budget this quarter' })
      .expect(204);
    const forRequester = await waitForNotification(requesterToken, 'requisition.rejected', reqId);
    expect(forRequester).toBeDefined();
  });

  it('invoice exception raised → AP', async () => {
    const { poId, poLineId } = await issuedPo();
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 100 }] })
      .expect(201);
    const invoice = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send({
        poId,
        invoiceNumber: `NH-${Date.now().toString(36)}`,
        invoiceDate: '2026-07-02',
        taxMinor: 0,
        totalMinor: 100 * 50_51, // price beyond ±1% → exception
        isFinal: true,
        lines: [{ poLineId, quantity: 100, unitPriceMinor: 50_51 }],
      })
      .expect(201);
    const invoiceId = invoice.body.data.id as string;
    const matched = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    expect(matched.body.data.outcome).toBe('exception');

    const forAp = await waitForNotification(apToken, 'invoice.exception', invoiceId);
    expect(forAp).toBeDefined();
  });

  it('PO amendment needing re-approval → the requisition approvers', async () => {
    const { poId, poLineId } = await issuedPo();
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poId}/amend`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        reason: 'Vendor raised unit price',
        lines: [{ poLineId, unitPriceMinor: 60_00 }], // 50_00 → 60_00 raises the total
      })
      .expect(200);
    const forApprover = await waitForNotification(leadToken, 'po.reapproval_required', poId);
    expect(forApprover).toBeDefined();
  });

  it('delegation created → the delegate', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/delegations')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ delegateEmail: 'head@demo', startsOn: '2026-07-10', endsOn: '2026-07-20' })
      .expect(201);
    const delegationId = created.body.data.id as string;
    const forDelegate = await waitForNotification(headToken, 'delegation.created', delegationId);
    expect(forDelegate).toBeDefined();
  });
});
