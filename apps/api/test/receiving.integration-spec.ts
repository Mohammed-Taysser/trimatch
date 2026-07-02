import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GrnSchema, InboxSchema, PurchaseOrderSchema, VendorSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: 'Receiving test requisition',
  neededBy: '2026-11-01',
  currency: 'USD',
  lines: [
    { description: 'Office chair', category: 'Furniture', quantity: 100, unitPriceMinor: 80_00 },
  ],
};

describe('goods receiving (FR-301/302 · TC-301/TC-302 · TC-204)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
  let purchasingToken: string;
  let warehouseToken: string;
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
    const step = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${leadToken}`)
          .expect(200);
        return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
      },
      (i) => i.requisition.id === reqId,
    );
    if (!step) throw new Error('step not in inbox');
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${step.stepId}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);
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

  async function poDetail(poId: string, token: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return PurchaseOrderSchema.parse(res.body.data);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    purchasingToken = await login('purchasing@demo');
    warehouseToken = await login('warehouse@demo');

    const vendor = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: `Umbrella Supplies ${Date.now().toString(36)}`,
        contactEmail: 'grn@umbrella.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    vendorId = VendorSchema.parse(vendor.body.data).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-301/TC-302: partial receipt then completion — open qty math, GRN numbers, PO states', async () => {
    const { poId, poLineId } = await issuedPo();

    // TC-301: receive 40 of 100
    const first = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 40 }] })
      .expect(201);
    const grn = GrnSchema.parse(first.body.data);
    expect(grn.grnNumber).toMatch(/^GRN-\d{4}-\d{4}$/);
    expect(grn.receivedByName).toBe('Winter Warehouse');

    let po = await poDetail(poId, warehouseToken);
    expect(po.status).toBe('partially_received');
    expect(po.lines[0]).toMatchObject({ receivedQuantity: 40, openQuantity: 60 });

    // TC-302: receive the remaining 60
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 60 }] })
      .expect(201);
    po = await poDetail(poId, warehouseToken);
    expect(po.status).toBe('received');
    expect(po.lines[0]).toMatchObject({ receivedQuantity: 100, openQuantity: 0 });
  });

  it('TC-204: a PO with a receipt can no longer be cancelled → 409 CANCEL_BLOCKED_RECEIVED', async () => {
    const { poId, poLineId } = await issuedPo();
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 1 }] })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poId}/cancel`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(409);
    expect(res.body.code).toBe('CANCEL_BLOCKED_RECEIVED');
  });

  it('receiving against a draft PO → 409 INVALID_TRANSITION', async () => {
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
    const step = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${leadToken}`)
          .expect(200);
        return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
      },
      (i) => i.requisition.id === reqId,
    );
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${step?.stepId}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);
    const draftPo = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: reqId, vendorId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({
        poId: draftPo.body.data.id,
        lines: [{ poLineId: draftPo.body.data.lines[0].id, quantity: 1 }],
      })
      .expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('a requester role cannot record receipts → 403', async () => {
    const { poId, poLineId } = await issuedPo();
    const res = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 1 }] })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
