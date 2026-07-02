import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MatchRecordSchema, PoVersionListSchema, PurchaseOrderSchema } from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { approveAcrossChain } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

// TC-603's given: an issued PO worth exactly $5,000 (100 × $50.00).
const DRAFT = {
  justification: 'PO amendment test requisition',
  neededBy: '2026-12-01',
  currency: 'USD',
  lines: [
    { description: 'Standing desk', category: 'Furniture', quantity: 100, unitPriceMinor: 50_00 },
  ],
};

describe('PO amendments with versioning (FR-604 · TC-603)', () => {
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

  async function issuedPo(): Promise<{ poId: string; poLineId: string }> {
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
    return { poId, poLineId: issued.body.data.lines[0].id as string };
  }

  function amend(poId: string, body: object, token = purchasingToken) {
    return request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poId}/amend`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
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
        name: `Amendment Vendor ${Date.now().toString(36)}`,
        contactEmail: 'amend@vendor.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    vendorId = vendor.body.data.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-603: $5k → $6k creates v2, requires re-approval, keeps v1 readable', async () => {
    const { poId, poLineId } = await issuedPo();

    // W: amend the unit price to $60.00 — total rises to $6,000
    const amended = await amend(poId, {
      reason: 'vendor raised the unit price',
      lines: [{ poLineId, unitPriceMinor: 60_00 }],
    }).expect(200);
    const po = PurchaseOrderSchema.parse(amended.body.data);
    expect(po.version).toBe(2);
    expect(po.status).toBe('pending_reapproval');
    expect(po.totalMinor).toBe(6_000_00);
    expect(po.lines[0].unitPriceMinor).toBe(60_00);

    // while re-approval is pending, neither goods nor invoices may flow
    const blockedReceipt = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 10 }] })
      .expect(409);
    expect(blockedReceipt.body.code).toBe('INVALID_TRANSITION');
    await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send({
        poId,
        invoiceNumber: `AMD-${Date.now().toString(36)}`,
        invoiceDate: '2026-07-03',
        taxMinor: 0,
        totalMinor: 6_000_00,
        isFinal: false,
        lines: [{ poLineId, quantity: 100, unitPriceMinor: 60_00 }],
      })
      .expect(409);

    // T: v1 is still readable, byte for byte
    const versions = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${poId}/versions?pageSize=100`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    const list = PoVersionListSchema.parse(versions.body.data);
    expect(versions.body.meta).toMatchObject({ total: 2 });
    expect(list[0]).toMatchObject({
      version: 1,
      current: false,
      totalMinor: 5_000_00,
      supersededReason: 'vendor raised the unit price',
    });
    expect(list[0].lines[0]).toMatchObject({ quantity: 100, unitPriceMinor: 50_00 });
    expect(list[1]).toMatchObject({ version: 2, current: true, totalMinor: 6_000_00 });

    // purchasing may not approve its own increase — an approver signs off
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poId}/approve-amendment`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(403);
    const approved = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poId}/approve-amendment`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(200);
    expect(approved.body.data.status).toBe('issued');

    // the amended price is the new 3-way-match baseline
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
        invoiceNumber: `AMD-${Date.now().toString(36)}`,
        invoiceDate: '2026-07-03',
        taxMinor: 0,
        totalMinor: 6_000_00,
        isFinal: true,
        lines: [{ poLineId, quantity: 100, unitPriceMinor: 60_00 }],
      })
      .expect(201);
    const match = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.body.data.id}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    expect(MatchRecordSchema.parse(match.body.data).outcome).toBe('matched');
  });

  it('a decrease bumps the version without re-approval', async () => {
    const { poId, poLineId } = await issuedPo();
    const res = await amend(poId, {
      reason: 'reduced scope',
      lines: [{ poLineId, quantity: 80 }],
    }).expect(200);
    const po = PurchaseOrderSchema.parse(res.body.data);
    expect(po.version).toBe(2);
    expect(po.status).toBe('issued');
    expect(po.totalMinor).toBe(4_000_00);
  });

  it('quantity can never drop below what was already received (I-2) → 422', async () => {
    const { poId, poLineId } = await issuedPo();
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 40 }] })
      .expect(201);
    const res = await amend(poId, {
      reason: 'cut the order',
      lines: [{ poLineId, quantity: 30 }],
    }).expect(422);
    expect(res.body.code).toBe('AMEND_BELOW_RECEIVED');
  });

  it('only issued or partially received POs can be amended; approval needs a pending one', async () => {
    // draft PO: convert without issuing
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
    await approveAcrossChain(app.getHttpServer(), [leadToken, headToken, findirToken], reqId);
    const converted = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: reqId, vendorId })
      .expect(201);
    const draftId = converted.body.data.id as string;
    const draftLineId = converted.body.data.lines[0].id as string;

    const blocked = await amend(draftId, {
      reason: 'too early',
      lines: [{ poLineId: draftLineId, quantity: 90 }],
    }).expect(409);
    expect(blocked.body.code).toBe('INVALID_TRANSITION');

    const noPending = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${draftId}/approve-amendment`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(409);
    expect(noPending.body.code).toBe('INVALID_TRANSITION');
  });

  it('superseded versions are append-only at the database level', async () => {
    const { poId, poLineId } = await issuedPo();
    await amend(poId, {
      reason: 'trim quantity',
      lines: [{ poLineId, quantity: 90 }],
    }).expect(200);
    await expect(
      app
        .get(Sequelize)
        .query(`UPDATE po_amendments SET reason = 'rewritten' WHERE po_id = '${poId}'`),
    ).rejects.toThrow(/append-only/);
    await expect(
      app.get(Sequelize).query(`DELETE FROM po_amendments WHERE po_id = '${poId}'`),
    ).rejects.toThrow(/append-only/);
  });
});
