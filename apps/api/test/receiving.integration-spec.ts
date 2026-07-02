import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GrnListSchema, GrnSchema, PurchaseOrderSchema, VendorSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { approveAcrossChain } from './helpers';

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
  let headToken: string;
  let findirToken: string;
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
    headToken = await login('head@demo');
    findirToken = await login('findir@demo');

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

  it('TC-303: receiving more than the open quantity → 422 OVER_RECEIPT_BLOCKED (I-2)', async () => {
    const { poId, poLineId } = await issuedPo();
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 40 }] })
      .expect(201);

    // open qty is 60 — receiving 61 must be refused
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 61 }] })
      .expect(422);
    expect(blocked.body.code).toBe('OVER_RECEIPT_BLOCKED');

    // nothing was recorded by the refused attempt (transaction rolled back)
    let po = await poDetail(poId, warehouseToken);
    expect(po.lines[0]).toMatchObject({ receivedQuantity: 40, openQuantity: 60 });

    // the exact boundary (60) still succeeds
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 60 }] })
      .expect(201);
    po = await poDetail(poId, warehouseToken);
    expect(po.status).toBe('received');
    expect(po.lines[0].openQuantity).toBe(0);
  });

  it('a multi-line receipt is atomic — one overflowing line rejects the whole GRN', async () => {
    // Two-line requisition so the PO has two lines.
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        ...DRAFT,
        lines: [
          { description: 'Desk', category: 'Furniture', quantity: 10, unitPriceMinor: 100_00 },
          { description: 'Lamp', category: 'Furniture', quantity: 5, unitPriceMinor: 20_00 },
        ],
      })
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
    const [lineA, lineB] = issued.body.data.lines as { id: string }[];

    const res = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({
        poId,
        lines: [
          { poLineId: lineA.id, quantity: 5 }, // fine
          { poLineId: lineB.id, quantity: 6 }, // overflows (ordered 5)
        ],
      })
      .expect(422);
    expect(res.body.code).toBe('OVER_RECEIPT_BLOCKED');

    const po = await poDetail(poId, warehouseToken);
    expect(po.status).toBe('issued'); // untouched
    expect(po.lines.map((l) => l.receivedQuantity)).toEqual([0, 0]);
  });

  it('TC-601: three receipts (40/30/30) against qty 100 → open qty 0, PO received (FR-601)', async () => {
    const { poId, poLineId } = await issuedPo();

    const grnNumbers: string[] = [];
    for (const [index, quantity] of [40, 30, 30].entries()) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${warehouseToken}`)
        .send({ poId, lines: [{ poLineId, quantity }] })
        .expect(201);
      grnNumbers.push(GrnSchema.parse(res.body.data).grnNumber);

      const po = await poDetail(poId, warehouseToken);
      const receivedSoFar = [40, 70, 100][index];
      expect(po.lines[0]).toMatchObject({
        receivedQuantity: receivedSoFar,
        openQuantity: 100 - receivedSoFar,
      });
      expect(po.status).toBe(index < 2 ? 'partially_received' : 'received');
    }

    // FR-601: the receipt history lists every GRN, oldest first.
    const history = await request(app.getHttpServer())
      .get(`/api/v1/receipts?poId=${poId}&pageSize=100`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);
    const grns = GrnListSchema.parse(history.body.data);
    expect(grns.map((grn) => grn.grnNumber)).toEqual(grnNumbers);
    expect(grns.map((grn) => grn.lines[0].quantity)).toEqual([40, 30, 30]);
    expect(history.body.meta).toMatchObject({ total: 3, page: 1 });

    // a fourth receipt against the completed PO is refused
    const closed = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 1 }] })
      .expect(409);
    expect(closed.body.code).toBe('INVALID_TRANSITION');
  });

  it('TC-304: 40 good + 5 damaged → open qty decreases by 40 only; damage queryable', async () => {
    const { poId, poLineId } = await issuedPo();
    const receipt = await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: 40, damagedQuantity: 5 }] })
      .expect(201);
    const grn = GrnSchema.parse(receipt.body.data);
    expect(grn.lines[0]).toMatchObject({ quantity: 40, damagedQuantity: 5 });

    const po = await poDetail(poId, warehouseToken);
    expect(po.status).toBe('partially_received');
    expect(po.lines[0]).toMatchObject({
      receivedQuantity: 40,
      openQuantity: 60,
      damagedQuantity: 5,
    });
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
    await approveAcrossChain(app.getHttpServer(), [leadToken, headToken, findirToken], reqId);
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
