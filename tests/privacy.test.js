import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;
let db;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'privacy_test_jwt_secret_123';
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_REGISTRATION_OTP = 'true';

  db = await import('../server/db.js');
  await (db.connectDb || db.default.connectDb)();
  const serverModule = await import('../server/server.js');
  app = serverModule.app || (serverModule.default && serverModule.default.app);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const DESCRIPTION = 'We are a local business serving customers across Nepal with everyday products and services. Our team focuses on fresh inventory fair pricing and reliable delivery so families and shops can depend on us. We take pride in careful packing clear communication and fast responses to orders questions and special requests from nearby neighborhoods and returning customers alike.';

let seq = 0;
const nextPhone = () => {
  seq += 1;
  return `98${String(Date.now() + seq * 17).slice(-8)}`;
};

async function register(role, label) {
  const email = role === 'seller' ? `${label}@${Date.now() + seq}.com` : `${label}${Date.now() + seq}@example.com`;
  const res = await request(app).post('/api/auth/register').send({
    name: role === 'seller' ? 'Privacy Seller' : 'Privacy Customer',
    email,
    password: 'Password123',
    confirmPassword: 'Password123',
    acceptTerms: true,
    role,
    phone: nextPhone(),
    ...(role === 'seller' ? { businessOfferingType: 'both' } : {}),
  });
  expect(res.status).toBe(201);
  return { email, token: res.body.token, id: String(res.body.user.id || res.body.user._id) };
}

let shopSeq = 0;

async function approvedBusiness() {
  const seller = await register('seller', 'privshop');
  shopSeq += 1;
  const biz = await request(app).post('/api/businesses').set('Authorization', `Bearer ${seller.token}`).send({
    name: `Privacy Test Shop ${String.fromCharCode(96 + shopSeq)}`,
    category: 'Grocery',
    location: 'Kathmandu',
    description: DESCRIPTION,
    contactEmail: seller.email,
    phone: '9841112233',
    hours: '09:00 - 18:00',
    offeringType: 'both',
    documentUrl: 'http://example.com/secret-registration.pdf',
    registrationNumber: 'REG-12345',
    panVatNumber: 'PAN-987654321',
  });
  expect(biz.status).toBe(201);
  const businessId = String(biz.body.business.id || biz.body.business._id);
  await db.Business().findByIdAndUpdate(businessId, { approvalStatus: 'approved' });
  return { seller, businessId };
}

const PRIVATE_FIELDS = ['documents', 'registrationNumber', 'panVatNumber', 'rejectionReason', 'commissionRate', 'approvedBy'];

describe('Registration consent', () => {
  it('records which policy version the user accepted', async () => {
    const customer = await register('customer', 'consent');
    const stored = await db.User().findById(customer.id);
    expect(stored.termsVersion).toBeTruthy();
    expect(stored.termsAcceptedAt).toBeTruthy();
  });
});

describe('Business privacy', () => {
  it('hides verification documents and tax IDs from the public', async () => {
    const { seller, businessId } = await approvedBusiness();

    const anon = await request(app).get(`/api/businesses/${businessId}`).expect(200);
    for (const field of PRIVATE_FIELDS) expect(anon.body.business).not.toHaveProperty(field);

    const list = await request(app).get('/api/businesses').expect(200);
    const listed = list.body.find((b) => String(b._id) === businessId);
    expect(listed).toBeTruthy();
    for (const field of PRIVATE_FIELDS) expect(listed).not.toHaveProperty(field);

    const owner = await request(app).get(`/api/businesses/${businessId}`).set('Authorization', `Bearer ${seller.token}`).expect(200);
    expect(owner.body.business.panVatNumber).toBe('PAN-987654321');
    expect(owner.body.business.documents).toContain('http://example.com/secret-registration.pdf');
  });
});

describe('Account data minimisation', () => {
  it('keeps only the latest login records and never returns them', async () => {
    const customer = await register('customer', 'logins');
    let login;
    for (let i = 0; i < 12; i += 1) {
      login = await request(app).post('/api/auth/login').send({ email: customer.email, password: 'Password123' }).expect(200);
    }
    expect(login.body.user).not.toHaveProperty('loginHistory');
    const stored = await db.User().findById(customer.id);
    expect(stored.loginHistory.length).toBe(10);
  });

  it('does not let ordinary users list every account', async () => {
    const customer = await register('customer', 'directory');
    await request(app).get('/api/users').set('Authorization', `Bearer ${customer.token}`).expect(403);
  });
});

describe('Ratings come from real reviews', () => {
  it('recalculates the rating when a review is edited or deleted', async () => {
    const { businessId } = await approvedBusiness();
    const customer = await register('customer', 'reviewer');
    const auth = { Authorization: `Bearer ${customer.token}` };

    const created = await request(app).post('/api/reviews').set(auth)
      .send({ businessId, targetId: businessId, targetType: 'business', rating: 4, comment: 'Good fresh vegetables' })
      .expect(201);
    let business = await db.Business().findById(businessId);
    expect(business.rating).toBe(4);
    expect(business.reviewCount).toBe(1);

    await request(app).put(`/api/reviews/${created.body.review._id}`).set(auth).send({ rating: 2 }).expect(200);
    business = await db.Business().findById(businessId);
    expect(business.rating).toBe(2);

    await request(app).delete(`/api/reviews/${created.body.review._id}`).set(auth).expect(200);
    business = await db.Business().findById(businessId);
    expect(business.rating).toBe(0);
    expect(business.reviewCount).toBe(0);
  });
});
