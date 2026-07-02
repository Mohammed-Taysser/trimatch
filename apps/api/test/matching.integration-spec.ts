import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InboxSchema, InvoiceSchema, MatchRecordSchema, VendorSchema } from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: '3-way match test requisition',
  neededBy: '2026-12-01',
  currency: 'USD',
  lines: [{ description: 'Widget', category: 'Parts', quantity: 100, unitPriceMinor: 50_00 }],
};

describe('the 3-way match end to end (FR-402/403/405/406)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
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

  async function receivedPo(receiveQty: number): Promise<{ poId: string; poLineId: string }> {
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
    const poLineId = issued.body.data.lines[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ poId, lines: [{ poLineId, quantity: receiveQty }] })
      .expect(201);
    return { poId, poLineId };
  }

  async function enterInvoice(
    poId: string,
    poLineId: string,
    opts: { qty: number; priceMinor: number; extraTotal?: number; isFinal?: boolean },
  ): Promise<string> {
    const total = opts.qty * opts.priceMinor + (opts.extraTotal ?? 0);
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send({
        poId,
        invoiceNumber: `M-${Date.now().toString(36)}-${Math.floor(performance.now() * 1000) % 100000}`,
        invoiceDate: '2026-07-02',
        taxMinor: 0,
        totalMinor: total,
        isFinal: opts.isFinal ?? true,
        lines: [{ poLineId, quantity: opts.qty, unitPriceMinor: opts.priceMinor }],
      })
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    purchasingToken = await login('purchasing@demo');
    warehouseToken = await login('warehouse@demo');
    apToken = await login('ap@demo');

    const vendor = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: `Stark Industries ${Date.now().toString(36)}`,
        contactEmail: 'match@stark.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    vendorId = VendorSchema.parse(vendor.body.data).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('an exact invoice matches and auto-advances to payable (cases A · FR-403/406)', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 50_00 });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const record = MatchRecordSchema.parse(res.body.data);
    expect(record.outcome).toBe('matched');
    expect(record.reasons).toEqual([]);
    expect(record.tolerances.priceToleranceBp).toBe(100);
    expect(record.comparisons[0].verdict).toBe('ok');

    const invoice = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    expect(InvoiceSchema.parse(invoice.body.data).status).toBe('payable');
  });

  it('a price beyond ±1% routes to exception with machine-readable reasons (case C)', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 50_51 });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const record = MatchRecordSchema.parse(res.body.data);
    expect(record.outcome).toBe('exception');
    expect(record.reasons[0]).toMatchObject({ code: 'PRICE_VARIANCE', lineNo: 1 });
    expect(record.comparisons[0].priceDeltaBp).toBe(102);

    const invoice = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    expect(invoice.body.data.status).toBe('exception');
  });

  it('cumulative over-invoicing across partial invoices is caught (case F/G · I-3)', async () => {
    const { poId, poLineId } = await receivedPo(50);
    const first = await enterInvoice(poId, poLineId, {
      qty: 50,
      priceMinor: 50_00,
      isFinal: false,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${first}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);

    const second = await enterInvoice(poId, poLineId, {
      qty: 10,
      priceMinor: 50_00,
      isFinal: false,
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${second}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const record = MatchRecordSchema.parse(res.body.data);
    expect(record.outcome).toBe('exception');
    expect(record.reasons[0].code).toBe('QTY_OVER_INVOICED');
    expect(record.comparisons[0].cumulativeInvoicedQty).toBe(60);
  });

  it('match records are immutable (FR-405) and re-matching is refused', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 50_00 });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);

    await expect(
      app
        .get(Sequelize)
        .query(`UPDATE match_records SET outcome = 'matched' WHERE id = '${res.body.data.id}'`),
    ).rejects.toThrow(/append-only/);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
  });
});
