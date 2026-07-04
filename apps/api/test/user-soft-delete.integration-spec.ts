import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditListSchema, RequisitionListSchema } from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { findAcrossPages } from './helpers';

// ADR-0007 tier 1: users are soft-deleted (deactivated), never hard-deleted — a
// deactivated user cannot authenticate and is excluded from approver pools, but
// every historical record still resolves the real actor, and a hard DELETE of a
// referenced user is refused by the FK.
// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

// $10 lands in R1 (chain: ['Team Lead']) under the default ruleset.
const SMALL_DRAFT = {
  justification: 'Soft-delete pool-exclusion probe',
  neededBy: '2026-12-01',
  currency: 'USD',
  lines: [{ description: 'Widget', category: 'Parts', quantity: 1, unitPriceMinor: 10_00 }],
};

let seq = 0;

describe('user soft-delete / deactivation (ADR-0007 · 869dzr8xe)', () => {
  let app: INestApplication;
  let sequelize: Sequelize;
  let adminToken: string;
  let adminId: string;
  let userId: string;
  let userEmail: string;
  let draftReqId: string;

  async function login(email: string): Promise<{ token: string; id: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  function setActive(id: string, active: boolean, token = adminToken) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active });
  }

  // Throwaway users so nothing here disturbs the seeded org that other specs
  // authenticate against. They log in with the shared demo PASSWORD.
  async function insertUser(
    fullName: string,
    role: string,
    active: boolean,
    managerId: string | null = null,
  ): Promise<{ id: string; email: string }> {
    const email = `sd-${Date.now().toString(36)}-${seq++}@demo`;
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO users (id, email, full_name, password_hash, role, manager_id, active, created_at, updated_at)
       VALUES (gen_random_uuid(), :email, :fullName, :hash, :role, :managerId, :active, now(), now())
       RETURNING id`,
      {
        replacements: {
          email,
          fullName,
          hash: bcrypt.hashSync(PASSWORD, 4),
          role,
          managerId,
          active,
        },
        type: QueryTypes.SELECT,
      },
    );
    return { id: rows[0].id, email };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    sequelize = app.get(Sequelize);

    const admin = await login('admin@demo');
    adminToken = admin.token;
    adminId = admin.id;

    const subject = await insertUser('Sydney Softdelete', 'requester', true);
    userId = subject.id;
    userEmail = subject.email;

    // a real draft so this user carries history that must survive deactivation
    const userToken = (await login(userEmail)).token;
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${userToken}`)
      .send(SMALL_DRAFT)
      .expect(201);
    draftReqId = created.body.data.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a deactivated user cannot log in, and reactivating restores access (reversible)', async () => {
    const off = await setActive(userId, false).expect(200);
    expect(off.body.data.active).toBe(false);

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password: PASSWORD })
      .expect(401);
    expect(blocked.body.code).toBe('ACCOUNT_DEACTIVATED');

    const on = await setActive(userId, true).expect(200);
    expect(on.body.data.active).toBe(true);

    // reversible: the exact same credentials work again
    await login(userEmail);
  });

  it('deactivation and reactivation are recorded in the audit trail', async () => {
    await setActive(userId, false).expect(200);
    await setActive(userId, true).expect(200);

    const audit = await request(app.getHttpServer())
      .get(`/api/v1/audit?entityType=user&entityId=${userId}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const entries = AuditListSchema.parse(audit.body.data);
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['user.deactivated', 'user.reactivated']),
    );
    expect(entries.find((e) => e.action === 'user.deactivated')).toMatchObject({
      fromState: 'active',
      toState: 'inactive',
      actorId: adminId,
    });
  });

  it('an admin cannot deactivate their own account', async () => {
    const res = await setActive(adminId, false).expect(409);
    expect(res.body.code).toBe('SELF_DEACTIVATION');
  });

  it("a deactivated user's historical records still resolve the real actor", async () => {
    await setActive(userId, false).expect(200);

    const found = await findAcrossPages(
      async (page) => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/requisitions/all?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        return {
          items: RequisitionListSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages as number,
        };
      },
      (r) => r.id === draftReqId,
    );
    expect(found?.requesterId).toBe(userId);
    expect(found?.requesterName).toBe('Sydney Softdelete');

    await setActive(userId, true).expect(200);
  });

  it('a referenced user cannot be hard-deleted — the FK refuses (NO ACTION)', async () => {
    // Attempt inside a transaction that rolls back on the FK violation, so the
    // seeded requester (referenced by requisitions) is never actually removed.
    await expect(
      sequelize.transaction((transaction) =>
        sequelize.query(`DELETE FROM users WHERE email = :email`, {
          replacements: { email: 'requester@demo' },
          type: QueryTypes.DELETE,
          transaction,
        }),
      ),
    ).rejects.toThrow(/foreign key/i);

    const [{ count }] = await sequelize.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM users WHERE email = 'requester@demo'`,
      { type: QueryTypes.SELECT },
    );
    expect(count).toBe(1);
  });

  it('a deactivated user is excluded from the approver pool (chain cannot resolve them)', async () => {
    const manager = await insertUser('Morgan Manager', 'approver', false); // deactivated lead
    const report = await insertUser('Reese Report', 'requester', true, manager.id);
    const reportToken = (await login(report.email)).token;

    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${reportToken}`)
      .send(SMALL_DRAFT)
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/requisitions/${created.body.data.id}/submit`)
      .set('Authorization', `Bearer ${reportToken}`)
      .expect(409);
    expect(blocked.body.code).toBe('NO_APPROVER');
  });
});
