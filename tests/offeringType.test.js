import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'offering_type_test_jwt_secret_123';
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_REGISTRATION_OTP = 'true';

  const dbModule = await import('../server/db.js');
  const connectDb = dbModule.connectDb || (dbModule.default && dbModule.default.connectDb);
  await connectDb();

  const serverModule = await import('../server/server.js');
  app = serverModule.app || (serverModule.default && serverModule.default.app);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const DESCRIPTION = 'We are a trusted local business serving customers across Nepal with quality products and friendly service every day of the week. Our team focuses on fresh inventory fair pricing and reliable delivery so families and shops can depend on us. We take pride in community support careful packing clear communication and fast responses to orders questions and special requests from nearby neighborhoods and returning customers alike.';

let phoneSeq = 0;
const nextPhone = () => `98${String(Date.now() + (phoneSeq += 7)).slice(-8)}`;

async function registerSeller(label, businessOfferingType) {
  const email = `${label}@${Date.now() + phoneSeq}.com`;
  const body = { name: 'Offer Seller', email, password: 'Password123', confirmPassword: 'Password123', acceptTerms: true, role: 'seller', phone: nextPhone() };
  if (businessOfferingType !== undefined) body.businessOfferingType = businessOfferingType;
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, email };
}

async function createBusiness(token, email, offeringType = 'both') {
  return request(app)
    .post('/api/businesses')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Offer Shop ${email.split('@')[0]}`,
      category: 'Grocery',
      location: 'Kathmandu',
      description: DESCRIPTION,
      contactEmail: email,
      phone: '9841112233',
      hours: '09:00 - 18:00',
      offeringType,
      documentUrl: 'http://example.com/doc.pdf',
    });
}

const addProduct = (token, businessId) => request(app)
  .post('/api/products')
  .set('Authorization', `Bearer ${token}`)
  .send({ businessId, name: 'Offer Product', brand: 'Test Brand', category: 'Retail', description: 'A product for catalog checks', price: 100, stock: 5, imageUrl: 'https://example.com/p.jpg' });

const addService = (token, businessId) => request(app)
  .post('/api/services')
  .set('Authorization', `Bearer ${token}`)
  .send({ businessId, name: 'Offer Service', category: 'Services', description: 'A service for catalog checks', price: 300, duration: 60 });

describe('Business catalog type chosen at registration', () => {
  it('stores the choice on the seller account and applies it to the new business', async () => {
    const { res, email } = await registerSeller('products', 'products');
    expect(res.status).toBe(201);
    expect(res.body.user.businessOfferingType).toBe('products');

    const token = res.body.token;
    const biz = await createBusiness(token, email, 'both');
    expect(biz.status).toBe(201);
    expect(biz.body.business.offeringType).toBe('products');

    const businessId = biz.body.business.id || biz.body.business._id;
    const service = await addService(token, businessId);
    expect(service.status).toBe(400);
    expect(service.body.message).toMatch(/products only/i);

    const profile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.body.businessOfferingType).toBe('products');

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Password123' });
    expect(login.body.user.businessOfferingType).toBe('products');
  });

  it('blocks products for a services-only business', async () => {
    const { res, email } = await registerSeller('services', 'services');
    const token = res.body.token;
    const biz = await createBusiness(token, email, 'both');
    expect(biz.body.business.offeringType).toBe('services');

    const product = await addProduct(token, biz.body.business.id || biz.body.business._id);
    expect(product.status).toBe(400);
    expect(product.body.message).toMatch(/services only/i);
  });

  it('defaults to both when no choice is sent and rejects invalid values', async () => {
    const { res } = await registerSeller('legacy');
    expect(res.status).toBe(201);
    expect(res.body.user.businessOfferingType).toBe('both');

    const bad = await registerSeller('invalid', 'everything');
    expect(bad.res.status).toBe(400);
    expect(bad.res.body.errors.businessOfferingType).toBeTruthy();
  });

  it('keeps the seller account in sync when the business changes its catalog type', async () => {
    const { res, email } = await registerSeller('switcher', 'products');
    const token = res.body.token;
    const biz = await createBusiness(token, email);
    const businessId = biz.body.business.id || biz.body.business._id;

    const invalid = await request(app).put(`/api/businesses/${businessId}`).set('Authorization', `Bearer ${token}`).send({ offeringType: 'all' });
    expect(invalid.status).toBe(400);

    const updated = await request(app).put(`/api/businesses/${businessId}`).set('Authorization', `Bearer ${token}`).send({ offeringType: 'both' });
    expect(updated.status).toBe(200);
    expect(updated.body.business.offeringType).toBe('both');

    const profile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.body.businessOfferingType).toBe('both');
  });
});

describe('Manual open/close switch', () => {
  it('records when it was set, can return to automatic, and does not resubmit the business', async () => {
    const { res, email } = await registerSeller('opener', 'both');
    const token = res.body.token;
    const biz = await createBusiness(token, email);
    const businessId = biz.body.business.id || biz.body.business._id;
    const statusBefore = biz.body.business.approvalStatus;

    const closed = await request(app).put(`/api/businesses/${businessId}`).set('Authorization', `Bearer ${token}`).send({ manualOpenOverride: false });
    expect(closed.status).toBe(200);
    expect(closed.body.business.manualOpenOverride).toBe(false);
    expect(closed.body.business.manualOverrideAt).toBeTruthy();
    expect(closed.body.business.approvalStatus).toBe(statusBefore);
    expect(closed.body.business.revisionStatus).not.toBe('resubmitted');

    const auto = await request(app).put(`/api/businesses/${businessId}`).set('Authorization', `Bearer ${token}`).send({ manualOpenOverride: null });
    expect(auto.status).toBe(200);
    expect(auto.body.business.manualOpenOverride).toBeNull();
    expect(auto.body.business.manualOverrideAt).toBeNull();
  });
});
