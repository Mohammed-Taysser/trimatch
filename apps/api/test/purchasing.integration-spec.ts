import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InboxSchema,
  PurchaseOrderSchema,
  RequisitionListSchema,
  VendorSchema,
} from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const DRAFT = {
  justification: 'PO-conversion test requisition',
  neededBy: '2026-10-01',
  currency: 'USD',
  lines: [
    { description: 'Server rack', category: 'IT hardware', quantity: 1, unitPriceMinor: 500_00 },
    { description: 'Rails kit', category: 'IT hardware', quantity: 2, unitPriceMinor: 45_50 },
  ],
};

describe('convert approved requisition to PO draft (FR-201 · TC-201/TC-202)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
  let purchasingToken: string;
  let vendorId: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  async function approvedRequisition(): Promise<string> {
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
    if (!item) throw new Error('step not in inbox');
    await request(app.getHttpServer())
      .post(`/api/v1/approvals/steps/${item.stepId}/approve`)
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(204);
    return reqId;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    purchasingToken = await login('purchasing@demo');

    const vendor = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: `Initech ${Date.now().toString(36)}`,
        contactEmail: 'po@initech.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    vendorId = VendorSchema.parse(vendor.body.data).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-201: approved REQ → PO draft with inherited lines; REQ becomes converted', async () => {
    const reqId = await approvedRequisition();

    const queued = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/requisitions/approved?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${purchasingToken}`)
          .expect(200);
        return {
          items: RequisitionListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages,
        };
      },
      (r) => r.id === reqId,
    );
    expect(queued).toBeDefined();

    const converted = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: reqId, vendorId })
      .expect(201);
    const po = PurchaseOrderSchema.parse(converted.body.data);
    expect(po).toMatchObject({ status: 'draft', poNumber: null, requisitionId: reqId });
    expect(po.totalMinor).toBe(591_00);
    expect(po.lines.map((l) => l.description)).toEqual(['Server rack', 'Rails kit']);

    const view = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${reqId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);
    expect(view.body.data.status).toBe('converted');

    const audit = await app
      .get(Sequelize)
      .query(
        "SELECT comment FROM audit_log WHERE entity_id = :id AND action = 'requisition.converted'",
        { replacements: { id: reqId }, type: QueryTypes.SELECT },
      );
    expect(audit).toHaveLength(1);
  });

  it('TC-201: price/SKU edits on the draft PO are audit-logged with the delta', async () => {
    const reqId = await approvedRequisition();
    const converted = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: reqId, vendorId })
      .expect(201);
    const po = PurchaseOrderSchema.parse(converted.body.data);

    const edited = await request(app.getHttpServer())
      .put(`/api/v1/purchase-orders/${po.id}/lines`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        lines: [
          {
            description: 'Server rack',
            category: 'IT hardware',
            vendorSku: 'INI-RACK-42U',
            quantity: 1,
            unitPriceMinor: 475_00,
          },
          {
            description: 'Rails kit',
            category: 'IT hardware',
            quantity: 2,
            unitPriceMinor: 45_50,
          },
        ],
      })
      .expect(200);
    const updated = PurchaseOrderSchema.parse(edited.body.data);
    expect(updated.totalMinor).toBe(566_00);
    expect(updated.lines[0].vendorSku).toBe('INI-RACK-42U');

    const audit = await app
      .get(Sequelize)
      .query<{ comment: string }>(
        "SELECT comment FROM audit_log WHERE entity_id = :id AND action = 'po.lines_edited'",
        { replacements: { id: po.id }, type: QueryTypes.SELECT },
      );
    expect(audit).toHaveLength(1);
    expect(audit[0].comment).toContain('price 50000 → 47500');
    expect(audit[0].comment).toContain('INI-RACK-42U');
  });

  it('TC-202: converting a pending requisition → 409 INVALID_TRANSITION', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send(DRAFT)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${created.body.data.id}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: created.body.data.id, vendorId })
      .expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('an inactive vendor cannot receive the PO → 409 VENDOR_INACTIVE', async () => {
    const inactive = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: `Dormant ${Date.now().toString(36)}`,
        contactEmail: 'x@dormant.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
        active: false,
      })
      .expect(201);
    const reqId = await approvedRequisition();
    const res = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ requisitionId: reqId, vendorId: inactive.body.data.id })
      .expect(409);
    expect(res.body.code).toBe('VENDOR_INACTIVE');
  });

  describe('issuing claims gapless numbers (FR-203 · I-6 · TC-203)', () => {
    async function draftPo(): Promise<string> {
      const reqId = await approvedRequisition();
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders/from-requisition')
        .set('Authorization', `Bearer ${purchasingToken}`)
        .send({ requisitionId: reqId, vendorId })
        .expect(201);
      return res.body.data.id as string;
    }

    it('TC-203: 3 concurrent issues → consecutive PO-YYYY-NNNN, no gaps or duplicates', async () => {
      const ids = [await draftPo(), await draftPo(), await draftPo()];
      const responses = await Promise.all(
        ids.map((id) =>
          request(app.getHttpServer())
            .post(`/api/v1/purchase-orders/${id}/issue`)
            .set('Authorization', `Bearer ${purchasingToken}`)
            .expect(200),
        ),
      );
      const numbers = responses.map((r) => PurchaseOrderSchema.parse(r.body.data).poNumber);
      const year = new Date().getUTCFullYear();
      for (const n of numbers) {
        expect(n).toMatch(new RegExp(`^PO-${year}-\\d{4}$`));
      }
      const suffixes = numbers
        .map((n) => Number((n as string).split('-')[2]))
        .sort((a, b) => a - b);
      expect(new Set(suffixes).size).toBe(3); // no duplicates
      expect(suffixes[2] - suffixes[0]).toBe(2); // no gaps
      expect(responses.every((r) => r.body.data.status === 'issued')).toBe(true);
    });

    it('I-8: PO total equals the exact sum of line totals in minor units', async () => {
      const id = await draftPo();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/purchase-orders/${id}`)
        .set('Authorization', `Bearer ${purchasingToken}`)
        .expect(200);
      const po = PurchaseOrderSchema.parse(res.body.data);
      const sum = po.lines.reduce((acc, l) => acc + l.lineTotalMinor, 0);
      expect(po.totalMinor).toBe(sum);
      for (const line of po.lines) {
        expect(line.lineTotalMinor).toBe(line.quantity * line.unitPriceMinor);
      }
    });

    it('issuing a non-draft PO → 409 INVALID_TRANSITION', async () => {
      const id = await draftPo();
      await request(app.getHttpServer())
        .post(`/api/v1/purchase-orders/${id}/issue`)
        .set('Authorization', `Bearer ${purchasingToken}`)
        .expect(200);
      const again = await request(app.getHttpServer())
        .post(`/api/v1/purchase-orders/${id}/issue`)
        .set('Authorization', `Bearer ${purchasingToken}`)
        .expect(409);
      expect(again.body.code).toBe('INVALID_TRANSITION');
    });
  });

  it('a requester role cannot convert → 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders/from-requisition')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ requisitionId: '019787c8-0000-4000-8000-000000000001', vendorId })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
