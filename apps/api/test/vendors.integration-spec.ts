import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VendorListSchema, VendorSchema } from '@trimatch/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { VendorsService } from '../src/vendors/vendors.service';

// Real infrastructure required: docker compose up -d && migrate && seed.
const PASSWORD = 'Demo123!';

describe('vendor registry (FR-202)', () => {
  let app: INestApplication;
  let purchasingToken: string;
  let requesterToken: string;
  const vendorName = `ACME Supplies ${Date.now().toString(36)}`;

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
    purchasingToken = await login('purchasing@demo');
    requesterToken = await login('requester@demo');
  });

  afterAll(async () => {
    await app.close();
  });

  it('purchasing creates a vendor with terms and currency', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: vendorName,
        contactEmail: 'sales@acme.example',
        currency: 'USD',
        paymentTerms: 'NET 30',
      })
      .expect(201);
    const vendor = VendorSchema.parse(res.body.data);
    expect(vendor).toMatchObject({ name: vendorName, paymentTerms: 'NET 30', active: true });
  });

  it('duplicate vendor names → 409 DUPLICATE_VENDOR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({
        name: vendorName,
        contactEmail: 'other@acme.example',
        currency: 'EUR',
        paymentTerms: 'NET 60',
      })
      .expect(409);
    expect(res.body.code).toBe('DUPLICATE_VENDOR');
  });

  it('update edits terms and the active flag; ?active=true filters', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/vendors?pageSize=100')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    const mine = VendorListSchema.parse(list.body.data).find((v) => v.name === vendorName);
    expect(mine).toBeDefined();

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/vendors/${mine?.id}`)
      .set('Authorization', `Bearer ${purchasingToken}`)
      .send({ paymentTerms: 'NET 45', active: false })
      .expect(200);
    expect(VendorSchema.parse(updated.body.data)).toMatchObject({
      paymentTerms: 'NET 45',
      active: false,
    });

    const activeOnly = await request(app.getHttpServer())
      .get('/api/v1/vendors?active=true')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    expect(VendorListSchema.parse(activeOnly.body.data).some((v) => v.id === mine?.id)).toBe(false);
  });

  it('an inactive vendor cannot receive new POs (assertActive → 409 VENDOR_INACTIVE)', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/vendors?pageSize=100')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    const inactive = VendorListSchema.parse(list.body.data).find((v) => v.name === vendorName);
    if (!inactive) throw new Error('vendor from previous test not found');
    const vendors = app.get(VendorsService);
    await expect(vendors.assertActive(inactive.id)).rejects.toMatchObject({
      response: { code: 'VENDOR_INACTIVE' },
    });
  });

  it('responses use the fixed envelope; lists carry pagination meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/vendors?page=1&pageSize=2')
      .set('Authorization', `Bearer ${purchasingToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ message: null, meta: { page: 1, pageSize: 2 } });
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.requestId).toBe('string');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(res.body.data.length);

    const err = await request(app.getHttpServer()).get('/api/v1/vendors?pageSize=100').expect(401);
    expect(err.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(typeof err.body.timestamp).toBe('string');
    expect(err.body.path).toContain('/api/v1/vendors');
  });

  it('a requester role cannot manage vendors → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/vendors?pageSize=100')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
