import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InboxSchema, InvoiceSchema, VendorSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: 'Invoicing test requisition',
  neededBy: '2026-11-15',
  currency: 'USD',
  lines: [{ description: 'Projector', category: 'AV', quantity: 2, unitPriceMinor: 600_00 }],
};

describe('vendor invoice entry (FR-401 · TC-401)', () => {
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

  async function receivedPo(): Promise<{ poId: string; poLineId: string }> {
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
      .send({ poId, lines: [{ poLineId, quantity: 2 }] })
      .expect(201);
    return { poId, poLineId };
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
        name: `Wayne Enterprises ${Date.now().toString(36)}`,
        contactEmail: 'ap@wayne.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    vendorId = VendorSchema.parse(vendor.body.data).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('records number, dates, per-line qty/price, tax and total in minor units', async () => {
    const { poId, poLineId } = await receivedPo();
    const number = `WAYNE-${Date.now().toString(36)}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send({
        poId,
        invoiceNumber: number,
        invoiceDate: '2026-07-02',
        dueDate: '2026-08-01',
        taxMinor: 120_00,
        totalMinor: 1320_00,
        lines: [{ poLineId, quantity: 2, unitPriceMinor: 600_00 }],
      })
      .expect(201);
    const invoice = InvoiceSchema.parse(res.body.data);
    expect(invoice).toMatchObject({
      invoiceNumber: number,
      status: 'entered',
      subtotalMinor: 1200_00,
      taxMinor: 120_00,
      totalMinor: 1320_00,
      dueDate: '2026-08-01',
    });
    expect(invoice.lines[0].lineTotalMinor).toBe(1200_00);
  });

  it('TC-401: the same vendor + invoice number entered again → 409 DUPLICATE_INVOICE', async () => {
    const { poId, poLineId } = await receivedPo();
    const payload = {
      poId,
      invoiceNumber: `DUP-${Date.now().toString(36)}`,
      invoiceDate: '2026-07-02',
      taxMinor: 0,
      totalMinor: 1200_00,
      lines: [{ poLineId, quantity: 2, unitPriceMinor: 600_00 }],
    };
    await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send(payload)
      .expect(201);
    const dup = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send(payload)
      .expect(409);
    expect(dup.body.code).toBe('DUPLICATE_INVOICE');
  });

  it('inconsistent totals → 422 TOTAL_MISMATCH (I-8)', async () => {
    const { poId, poLineId } = await receivedPo();
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${apToken}`)
      .send({
        poId,
        invoiceNumber: `BAD-${Date.now().toString(36)}`,
        invoiceDate: '2026-07-02',
        taxMinor: 0,
        totalMinor: 1199_99,
        lines: [{ poLineId, quantity: 2, unitPriceMinor: 600_00 }],
      })
      .expect(422);
    expect(res.body.code).toBe('TOTAL_MISMATCH');
  });

  it('a requester role cannot enter invoices → 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({})
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
