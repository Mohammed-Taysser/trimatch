import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditListSchema, RequisitionListSchema, UserAdminListSchema } from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

describe('superadmin dashboard endpoints (Epic 7 · admin-only)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: string;
  let requesterToken: string;
  let leadId: string;
  let subjectId: string;

  async function login(email: string): Promise<{ token: string; id: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    const admin = await login('admin@demo');
    adminToken = admin.token;
    adminId = admin.id;
    requesterToken = (await login('requester@demo')).token;
    leadId = (await login('lead@demo')).id;

    // a throwaway subject so role/manager changes never disturb seeded users
    const rows = await app.get(Sequelize).query<{ id: string }>(
      `INSERT INTO users (id, email, full_name, password_hash, role, created_at, updated_at)
       VALUES (gen_random_uuid(), :email, 'Terry Throwaway', 'x', 'requester', now(), now())
       RETURNING id`,
      {
        replacements: { email: `throwaway-${Date.now().toString(36)}@demo` },
        type: QueryTypes.SELECT,
      },
    );
    subjectId = rows[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists every user with manager names; non-admins get 403', async () => {
    const found = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/users?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        return {
          items: UserAdminListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages as number,
        };
      },
      (u) => u.email === 'requester@demo',
    );
    expect(found).toBeDefined();
    expect(found?.managerName).toBe('Lee Lead');

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);
  });

  it('role and manager changes apply and land in the audit trail', async () => {
    const roleChanged = await request(app.getHttpServer())
      .patch(`/api/v1/users/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'approver' })
      .expect(200);
    expect(roleChanged.body.data.role).toBe('approver');

    const managerChanged = await request(app.getHttpServer())
      .patch(`/api/v1/users/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ managerId: leadId })
      .expect(200);
    expect(managerChanged.body.data.managerName).toBe('Lee Lead');

    const audit = await request(app.getHttpServer())
      .get(`/api/v1/audit?entityType=user&entityId=${subjectId}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const entries = AuditListSchema.parse(audit.body.data);
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['user.role_changed', 'user.manager_changed']),
    );
    const roleRow = entries.find((e) => e.action === 'user.role_changed');
    expect(roleRow).toMatchObject({ fromState: 'requester', toState: 'approver' });
    expect(roleRow?.actorId).toBe(adminId);
    // the filter really scopes the timeline to one entity
    expect(entries.every((e) => e.entityId === subjectId && e.entityType === 'user')).toBe(true);
  });

  it('guards: self role change, self manager, unknown manager, non-admin, empty change', async () => {
    const self = await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'requester' })
      .expect(409);
    expect(self.body.code).toBe('SELF_ROLE_CHANGE');

    const ownManager = await request(app.getHttpServer())
      .patch(`/api/v1/users/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ managerId: subjectId })
      .expect(409);
    expect(ownManager.body.code).toBe('SELF_MANAGER');

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ managerId: '019787c8-dead-4000-8000-000000000000' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${subjectId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ role: 'ap' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(422);
  });

  it('the audit browser is admin-only and paginated', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit?pageSize=5')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5 });
    expect(AuditListSchema.parse(res.body.data).length).toBeLessThanOrEqual(5);
  });

  it('admin sees every requisition org-wide, filterable by status', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        justification: 'Admin dashboard visibility test',
        neededBy: '2026-12-01',
        currency: 'USD',
        lines: [{ description: 'Widget', category: 'Parts', quantity: 1, unitPriceMinor: 10_00 }],
      })
      .expect(201);
    const reqId = created.body.data.id as string;

    const found = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/requisitions/all?status=draft&page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        return {
          items: RequisitionListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages as number,
        };
      },
      (r) => r.id === reqId,
    );
    expect(found).toBeDefined();
    expect(found?.status).toBe('draft');

    await request(app.getHttpServer())
      .get('/api/v1/requisitions/all')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);
  });

  it('purchase orders filter by status server-side (ticket 869dza4zp)', async () => {
    const issuedOnly = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=issued&pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const issued = issuedOnly.body.data as { status: string }[];
    expect(issued.length).toBeGreaterThan(0);
    expect(issued.every((po) => po.status === 'issued')).toBe(true);

    const worklist = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=issued,partially_received&pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listed = worklist.body.data as { status: string }[];
    expect(listed.every((po) => po.status === 'issued' || po.status === 'partially_received')).toBe(
      true,
    );
    expect(worklist.body.meta.total).toBeGreaterThanOrEqual(issuedOnly.body.meta.total);

    const invalid = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=bogus')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });
});
