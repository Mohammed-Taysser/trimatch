import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequisitionSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';
const TWO_LINES = {
  justification: 'Two new monitors for the design team',
  neededBy: '2026-08-01',
  currency: 'USD',
  lines: [
    { description: '27" monitor', category: 'IT hardware', quantity: 2, unitPriceMinor: 15_00 },
    { description: 'HDMI cable', category: 'IT hardware', quantity: 3, unitPriceMinor: 9_99 },
  ],
};

describe('draft requisitions (FR-101/102 · TC-101..103)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    tokenA = await login('requester@demo');
    tokenB = await login('requester2@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-101: requester creates a requisition with 2 lines → draft, totals in minor units', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    const req = RequisitionSchema.parse(res.body);
    expect(req.status).toBe('draft');
    expect(req.totalMinor).toBe(59_97);
    expect(req.lines.map((l) => l.lineTotalMinor)).toEqual([30_00, 29_97]);
    expect(req.lines.map((l) => l.lineNo)).toEqual([1, 2]);
  });

  it('TC-102: create with 0 lines → 422 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...TWO_LINES, lines: [] })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('TC-103: user B edits or deletes user A draft → 403 FORBIDDEN', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    const id = created.body.id as string;

    const edit = await request(app.getHttpServer())
      .put(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send(TWO_LINES)
      .expect(403);
    expect(edit.body.code).toBe('FORBIDDEN');

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
    expect(del.body.code).toBe('FORBIDDEN');
  });

  it('owner edits a draft → totals recomputed; owner deletes → gone', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(TWO_LINES)
      .expect(201);
    const id = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...TWO_LINES,
        lines: [
          { description: 'Desk', category: 'Furniture', quantity: 1, unitPriceMinor: 120_00 },
        ],
      })
      .expect(200);
    expect(RequisitionSchema.parse(updated.body).totalMinor).toBe(120_00);

    await request(app.getHttpServer())
      .delete(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
    const gone = await request(app.getHttpServer())
      .get(`/api/v1/requisitions/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(gone.body.code).toBe('NOT_FOUND');
  });

  it('list returns only the requesting user own requisitions', async () => {
    const mine = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(TWO_LINES)
      .expect(201);
    const listA = await request(app.getHttpServer())
      .get('/api/v1/requisitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const idsA = (listA.body as { id: string }[]).map((r) => r.id);
    expect(idsA).not.toContain(mine.body.id);
  });

  it('a non-requester role cannot create requisitions (403)', async () => {
    const approverToken = await login('lead@demo');
    const res = await request(app.getHttpServer())
      .post('/api/v1/requisitions')
      .set('Authorization', `Bearer ${approverToken}`)
      .send(TWO_LINES)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
