import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InboxSchema,
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
  RequisitionListSchema,
  VendorListSchema,
} from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { collectAcrossPages, findAcrossPages } from './helpers';

// Requires migrate && seed — asserts the demo org from runbook §1 is demoable.
const PASSWORD = 'Demo123!';
const YEAR = new Date().getUTCFullYear();

describe('seeded demo org covers the full MVP flow (869dz0fug)', () => {
  let app: INestApplication;
  let requesterToken: string;
  let leadToken: string;
  let purchasingToken: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    requesterToken = await login('requester@demo');
    leadToken = await login('lead@demo');
    purchasingToken = await login('purchasing@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('the requester sees seeded requisitions in every lifecycle state', async () => {
    const statuses = new Map<string, string>();
    await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/requisitions?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${requesterToken}`)
          .expect(200);
        const items = RequisitionListSchema.parse(res.body.data);
        for (const r of items) {
          if (r.justification.includes('(demo')) statuses.set(r.status, r.justification);
        }
        return { items, totalPages: res.body.meta.totalPages };
      },
      () => false, // walk everything
    );
    for (const expected of ['draft', 'pending_approval', 'rejected', 'approved', 'converted']) {
      expect(statuses.has(expected)).toBe(true);
    }
  });

  it('the approver inbox contains the seeded pending step', async () => {
    const item = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${leadToken}`)
          .expect(200);
        return { items: InboxSchema.parse(res.body.data), totalPages: res.body.meta.totalPages };
      },
      (i) => i.requisition.justification.includes('demo pending'),
    );
    expect(item?.requisition.requesterName).toBe('Riley Requester');
  });

  it('purchasing sees the demo vendors including the inactive one', async () => {
    // Collect across pages — a long-lived local DB accumulates vendors that push
    // the seeded (demo) ones off the first page.
    const demo = await collectAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/vendors?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${purchasingToken}`)
          .expect(200);
        return {
          items: VendorListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages as number,
        };
      },
      (v) => v.name.includes('(demo)'),
    );
    expect(demo.length).toBeGreaterThanOrEqual(3);
    expect(demo.some((v) => !v.active)).toBe(true);
  });

  it('the seeded PO is partially received with correct open and damaged quantities', async () => {
    const po = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/purchase-orders?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${purchasingToken}`)
          .expect(200);
        return {
          items: PurchaseOrderListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages,
        };
      },
      (p) => p.poNumber === `PO-${YEAR}-9001`,
    );
    expect(po?.status).toBe('partially_received');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${po?.id}`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    expect(PurchaseOrderSchema.parse(detail.body.data).lines[0]).toMatchObject({
      receivedQuantity: 12,
      openQuantity: 8,
      damagedQuantity: 1,
    });
  });

  it('the seeded rejection carries its reason verbatim for the requester', async () => {
    const rejected = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/requisitions?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${requesterToken}`)
          .expect(200);
        return {
          items: RequisitionListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages,
        };
      },
      (r) => r.justification.includes('demo rejected'),
    );
    expect(rejected?.steps[0]).toMatchObject({
      status: 'rejected',
      reason: 'Budget freeze — resubmit next quarter (demo)',
      approverName: 'Lee Lead',
    });
  });
});
