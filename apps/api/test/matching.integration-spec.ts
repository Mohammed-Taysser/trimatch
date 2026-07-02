import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InboxSchema, InvoiceSchema, MatchRecordSchema, VendorSchema } from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
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

  it('the exceptions queue lists exceptions with side-by-side deltas and filters (FR-603)', async () => {
    // create one PRICE_VARIANCE exception for this vendor
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 55_00 });
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);

    const queue = await request(app.getHttpServer())
      .get(`/api/v1/exceptions?vendorId=${vendorId}&reason=PRICE_VARIANCE&pageSize=100`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const item = (
      queue.body.data as {
        invoice: { id: string };
        match: { comparisons: unknown[]; reasons: { code: string }[] };
      }[]
    ).find((i) => i.invoice.id === invoiceId);
    expect(item).toBeDefined();
    expect(item?.match.reasons[0].code).toBe('PRICE_VARIANCE');
    // side-by-side: ordered / received / invoiced / both prices / verdict
    expect(item?.match.comparisons[0]).toMatchObject({
      orderedQty: 100,
      receivedQty: 100,
      cumulativeInvoicedQty: 100,
      poUnitPriceMinor: 50_00,
      invoiceUnitPriceMinor: 55_00,
      verdict: 'PRICE_VARIANCE',
    });

    // a non-matching reason filter excludes it
    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/exceptions?vendorId=${vendorId}&reason=TOTAL_VARIANCE&pageSize=100`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const excluded = (filtered.body.data as { invoice: { id: string } }[]).some(
      (i) => i.invoice.id === invoiceId,
    );
    expect(excluded).toBe(false);

    // age filter: nothing this fresh is older than 5 days
    const aged = await request(app.getHttpServer())
      .get(`/api/v1/exceptions?vendorId=${vendorId}&olderThanDays=5&pageSize=100`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    expect(
      (aged.body.data as { invoice: { id: string } }[]).some((i) => i.invoice.id === invoiceId),
    ).toBe(false);
  });

  it('TC-403: accepting a variance requires a reason and lands in variance_accepted', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 55_00 });
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);

    // no reason → 422 REASON_REQUIRED
    const missing = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/accept-variance`)
      .set('Authorization', `Bearer ${apToken}`)
      .send({})
      .expect(422);
    expect(missing.body.code).toBe('REASON_REQUIRED');

    const reason = 'Vendor price list updated — variance approved by finance';
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/accept-variance`)
      .set('Authorization', `Bearer ${apToken}`)
      .send({ reason })
      .expect(200);
    expect(res.body.data.status).toBe('variance_accepted');

    const audit = await app
      .get(Sequelize)
      .query<{ comment: string }>(
        `SELECT comment FROM audit_log WHERE entity_id = '${invoiceId}' AND action = 'invoice.variance_accepted'`,
        { type: QueryTypes.SELECT },
      );
    expect(audit).toEqual([expect.objectContaining({ comment: reason })]);
  });

  it('requesting a credit note holds the invoice in awaiting_credit_note', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 55_00 });
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/request-credit-note`)
      .set('Authorization', `Bearer ${apToken}`)
      .send({ reason: 'Credit note for the price delta requested from vendor' })
      .expect(200);
    expect(res.body.data.status).toBe('awaiting_credit_note');
  });

  it('rejecting returns the invoice to the vendor; resolutions need an exception', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 55_00 });
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/reject`)
      .set('Authorization', `Bearer ${apToken}`)
      .send({ reason: 'Billing errors — please reissue' })
      .expect(200);
    expect(res.body.data.status).toBe('rejected');

    // resolving a non-exception invoice is refused
    const again = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/accept-variance`)
      .set('Authorization', `Bearer ${apToken}`)
      .send({ reason: 'x' })
      .expect(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
  });

  it('TC-405: an unmatched invoice cannot be marked payable → 409 MATCH_REQUIRED (I-4)', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 50_00 });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payable`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(409);
    expect(res.body.code).toBe('MATCH_REQUIRED');
  });

  it('an accepted variance can be marked payable (FR-406 accepted-variance path)', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 55_00 });
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/accept-variance`)
      .set('Authorization', `Bearer ${apToken}`)
      .send({ reason: 'Approved by finance director' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payable`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    expect(res.body.data.status).toBe('payable');
  });

  it('TC-404: match records refuse DELETE as well as UPDATE', async () => {
    const { poId, poLineId } = await receivedPo(100);
    const invoiceId = await enterInvoice(poId, poLineId, { qty: 100, priceMinor: 50_00 });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/match`)
      .set('Authorization', `Bearer ${apToken}`)
      .expect(200);
    await expect(
      app.get(Sequelize).query(`DELETE FROM match_records WHERE id = '${res.body.data.id}'`),
    ).rejects.toThrow(/append-only/);
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
