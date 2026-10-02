import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildSuggestions, groupsOfText } = require('../server/suggestions');

const shop = (id, category, extra = {}) => ({ _id: id, name: `Shop ${id}`, category, ...extra });
const item = (id, businessId, name, extra = {}) => ({ _id: id, businessId, name, price: 500, imageUrl: `https://img/${id}.jpg`, ...extra });
const suggest = (business, businesses, products, services = []) => buildSuggestions({
  business, businesses: [business, ...businesses], products, services, isLive: () => true, distanceKm: () => 3,
});

describe('suggestion matching', () => {
  it('matches whole words and plurals only', () => {
    expect([...groupsOfText('Mobile phones and laptops')]).toEqual(['electronics']);
    expect([...groupsOfText('Team spare parts')]).toEqual([]);
    expect([...groupsOfText('Cafe & Bakery')]).toEqual(['food']);
  });

  it('suggests food and other cafes to a cafe', () => {
    const cafe = shop('cafe', 'Cafe', { subcategory: 'Coffee house' });
    const others = [shop('rest', 'Restaurants'), shop('tech', 'Electronics'), shop('salon', 'Beauty Salon'), shop('bakery', 'Bakery')];
    const { groups, items } = suggest(cafe, others, [
      item('p1', 'tech', 'iPhone 15', { rating: 5 }),
      item('p2', 'rest', 'Chicken Momo'),
      item('p3', 'bakery', 'Black Forest Cake'),
      item('p4', 'salon', 'Hair Spa', { rating: 5 }),
    ]);
    expect(groups).toEqual(['food']);
    expect(items.slice(0, 2).map((i) => i.name).sort()).toEqual(['Black Forest Cake', 'Chicken Momo']);
    expect(items.slice(0, 2).every((i) => i.match === 'similar')).toBe(true);
  });

  it('suggests phones and laptops to an electronics shop, even from a general store', () => {
    const tech = shop('tech', 'Electronics');
    const others = [shop('gadget', 'Mobile & Computer Store'), shop('mart', 'Department Store'), shop('rest', 'Restaurant')];
    const { items } = suggest(tech, others, [
      item('p1', 'rest', 'Veg Thali', { rating: 5 }),
      item('p2', 'gadget', 'Redmi Note 13'),
      item('p3', 'mart', 'Dell Inspiron Laptop'),
      item('p4', 'mart', 'Cotton Towel', { rating: 5 }),
    ]);
    expect(items.slice(0, 2).map((i) => i.name).sort()).toEqual(['Dell Inspiron Laptop', 'Redmi Note 13']);
    expect(items.find((i) => i.name === 'Veg Thali').match).toBe('popular');
  });

  it('returns at most six items and never the business itself', () => {
    const cafe = shop('cafe', 'Cafe');
    const others = ['a', 'b', 'c', 'd'].map((id) => shop(id, 'Restaurant'));
    const products = [
      item('own', 'cafe', 'Own Latte'),
      ...others.flatMap((b) => [1, 2, 3].map((n) => item(`${b._id}${n}`, b._id, `Meal ${b._id}${n}`))),
    ];
    const { items } = suggest(cafe, others, products);
    expect(items).toHaveLength(6);
    expect(items.some((i) => i.businessId === 'cafe')).toBe(false);
  });
});

let mongo;
let app;
let db;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'suggestions_test_jwt_secret_123';
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

const DESCRIPTION = 'We are a trusted local business serving customers across Nepal with quality products and friendly service every day of the week. Our team focuses on fresh inventory fair pricing and reliable delivery so families and shops can depend on us. We take pride in community support careful packing clear communication and fast responses to orders questions and special requests from nearby neighborhoods and returning customers alike.';

let seq = 0;

async function sellerWithBusiness(label) {
  seq += 1;
  const email = `${label}@${Date.now() + seq}.com`;
  const phone = `98${String(Date.now() + seq * 13).slice(-8)}`;
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Suggest Seller', email, password: 'Password123', confirmPassword: 'Password123', acceptTerms: true, role: 'seller', phone, businessOfferingType: 'both',
  });
  const token = reg.body.token;
  const biz = await request(app).post('/api/businesses').set('Authorization', `Bearer ${token}`).send({
    name: `Suggest Shop ${label} ${String.fromCharCode(96 + seq)}`,
    category: 'Grocery',
    location: 'Kathmandu',
    description: DESCRIPTION,
    contactEmail: email,
    phone: '9841112233',
    hours: '09:00 - 18:00',
    offeringType: 'both',
    documentUrl: 'http://example.com/doc.pdf',
  });
  expect(biz.status).toBe(201);
  const businessId = String(biz.body.business.id || biz.body.business._id);
  await db.Business().findByIdAndUpdate(businessId, { approvalStatus: 'approved' });
  return { token, businessId };
}

const addProduct = (token, businessId, overrides = {}) => request(app)
  .post('/api/products')
  .set('Authorization', `Bearer ${token}`)
  .send({ businessId, name: 'Suggest Rice', brand: 'Test Brand', category: 'Retail', description: 'A product for suggestion checks', price: 200, stock: 5, imageUrl: 'https://example.com/p.jpg', ...overrides });

describe('Business profile suggestions', () => {
  it('suggests items from other live businesses only', async () => {
    const current = await sellerWithBusiness('current');
    const other = await sellerWithBusiness('other');
    const suspended = await sellerWithBusiness('suspended');

    expect((await addProduct(current.token, current.businessId, { name: 'Own Rice' })).status).toBe(201);
    expect((await addProduct(other.token, other.businessId, { name: 'Neighbour Rice', discount: 10 })).status).toBe(201);
    expect((await addProduct(suspended.token, suspended.businessId, { name: 'Hidden Rice' })).status).toBe(201);
    await db.Business().findByIdAndUpdate(suspended.businessId, { approvalStatus: 'suspended' });

    const res = await request(app).get(`/api/businesses/${current.businessId}/suggestions`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((item) => item.name);
    expect(names).toContain('Neighbour Rice');
    expect(names).not.toContain('Own Rice');
    expect(names).not.toContain('Hidden Rice');

    const neighbour = res.body.items.find((item) => item.name === 'Neighbour Rice');
    expect(neighbour).toMatchObject({ kind: 'product', businessId: other.businessId, price: 180, originalPrice: 200, discount: 10 });
    expect(neighbour.businessName).toMatch(/Suggest Shop other/);
    expect(res.body.items.every((item) => item.businessId !== current.businessId)).toBe(true);
  });

  it('returns 404 for unknown or malformed business ids', async () => {
    expect((await request(app).get('/api/businesses/not-an-id/suggestions')).status).toBe(404);
    expect((await request(app).get(`/api/businesses/${new mongoose.Types.ObjectId()}/suggestions`)).status).toBe(404);
  });
});
