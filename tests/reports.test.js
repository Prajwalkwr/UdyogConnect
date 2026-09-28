import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;
let models;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'reports_test_secret';
  process.env.NODE_ENV = 'test';
  process.env.SEED_DEMO = 'true';
  delete process.env.STRIPE_SECRET_KEY;

  models = await import('../server/db.js');
  await models.connectDb();
  const serverModule = await import('../server/server.js');
  app = serverModule.app || serverModule.default?.app;
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function login(email, password = 'password') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return { ...res.body.user, token: res.body.token };
}

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
const idOf = (user) => String(user._id || user.id);

describe('content reports', () => {
  let customer;
  let seller;
  let admin;
  let businessId;
  let reviewId;

  beforeAll(async () => {
    customer = await login('customer@udyog.np');
    seller = await login('seller@udyog.np');
    admin = await login('admin@udyog.np');

    const business = await models.Business().findOne({}).lean();
    businessId = String(business._id);
    await models.Business().findByIdAndUpdate(businessId, { ownerId: idOf(seller) });
    const review = await models.Review().create({
      customerId: idOf(customer),
      customerName: 'Test Customer',
      businessId,
      targetId: businessId,
      targetType: 'business',
      rating: 1,
      comment: 'Terrible fake review text',
    });
    reviewId = String(review._id);
  }, 60000);

  const report = (user, body) => request(app).post('/api/reports').set(auth(user)).send(body);

  it('requires sign-in, a known reason and details for "other"', async () => {
    expect((await request(app).post('/api/reports').send({ targetType: 'business', targetId: businessId, reason: 'scam' })).status).toBe(401);
    expect((await report(customer, { targetType: 'business', targetId: businessId, reason: 'nope' })).status).toBe(400);
    expect((await report(customer, { targetType: 'business', targetId: businessId, reason: 'other' })).status).toBe(400);
    expect((await report(customer, { targetType: 'planet', targetId: businessId, reason: 'scam' })).status).toBe(400);
    expect((await report(customer, { targetType: 'business', targetId: 'not-an-id', reason: 'scam' })).status).toBe(404);
  });

  it('blocks reporting your own business or review', async () => {
    const own = await report(seller, { targetType: 'business', targetId: businessId, reason: 'scam' });
    expect(own.status).toBe(400);
    const ownReview = await report(customer, { targetType: 'review', targetId: reviewId, reason: 'fake' });
    expect(ownReview.status).toBe(400);
  });

  it('files a business report once per user', async () => {
    const first = await report(customer, { targetType: 'business', targetId: businessId, reason: 'scam', details: 'Took payment, never delivered' });
    expect(first.status).toBe(201);
    expect(first.body.alreadyReported).toBe(false);
    const again = await report(customer, { targetType: 'business', targetId: businessId, reason: 'scam' });
    expect(again.status).toBe(200);
    expect(again.body.alreadyReported).toBe(true);
    expect(await models.Report().countDocuments({ targetType: 'business', targetId: businessId })).toBe(1);
  });

  it('flags the review and keeps reporter identity out of public review data', async () => {
    const res = await report(seller, { targetType: 'review', targetId: reviewId, reason: 'fake' });
    expect(res.status).toBe(201);
    const review = await models.Review().findById(reviewId).lean();
    expect(review.reported).toBe(true);
    expect(review.reportCount).toBe(1);

    const publicReviews = await request(app).get('/api/reviews?limit=50');
    const text = JSON.stringify(publicReviews.body);
    expect(text).not.toContain('reporterId');
    expect(text).not.toContain('reporterName');
  });

  it('shows reports to admins only, with reporter and reason', async () => {
    expect((await request(app).get('/api/admin/content-reports').set(auth(customer))).status).toBe(403);
    expect((await request(app).get('/api/admin/content-reports/summary').set(auth(seller))).status).toBe(403);

    const summary = await request(app).get('/api/admin/content-reports/summary').set(auth(admin));
    expect(summary.body.open).toBe(2);

    const list = await request(app).get('/api/admin/content-reports?status=open').set(auth(admin));
    expect(list.status).toBe(200);
    expect(list.body.counts.open).toBe(2);
    const bizItem = list.body.items.find((item) => item.targetType === 'business');
    expect(bizItem.target.exists).toBe(true);
    expect(bizItem.reports[0]).toMatchObject({ reason: 'scam', reasonLabel: 'Scam or fraud', details: 'Took payment, never delivered' });
    expect(bizItem.reports[0].reporterName).toBeTruthy();
    const reviewItem = list.body.items.find((item) => item.targetType === 'review');
    expect(reviewItem.target.comment).toBe('Terrible fake review text');
  });

  it('lets admins dismiss business reports', async () => {
    const res = await request(app).post('/api/admin/content-reports/action').set(auth(admin))
      .send({ targetType: 'business', targetId: businessId, action: 'dismiss' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dismissed');
    const again = await request(app).post('/api/admin/content-reports/action').set(auth(admin))
      .send({ targetType: 'business', targetId: businessId, action: 'dismiss' });
    expect(again.status).toBe(409);
    const summary = await request(app).get('/api/admin/content-reports/summary').set(auth(admin));
    expect(summary.body.open).toBe(1);
  });

  it('keeps the legacy review flag route working and lets admins remove the review', async () => {
    const legacy = await request(app).put(`/api/reviews/${reviewId}/report`).set(auth(admin)).send({});
    expect(legacy.status).toBe(201);
    expect((await models.Review().findById(reviewId).lean()).reportCount).toBe(2);

    const blocked = await request(app).post('/api/admin/content-reports/action').set(auth(seller))
      .send({ targetType: 'review', targetId: reviewId, action: 'remove_review' });
    expect(blocked.status).toBe(403);

    const removed = await request(app).post('/api/admin/content-reports/action').set(auth(admin))
      .send({ targetType: 'review', targetId: reviewId, action: 'remove_review' });
    expect(removed.status).toBe(200);
    expect(removed.body.handled).toBe(2);
    expect(await models.Review().findById(reviewId)).toBeNull();

    const resolved = await request(app).get('/api/admin/content-reports?status=resolved').set(auth(admin));
    const item = resolved.body.items.find((entry) => entry.targetId === reviewId);
    expect(item.target.exists).toBe(false);
    expect(item.target.comment).toBe('Terrible fake review text');
    expect(item.reports.every((r) => r.resolution === 'Review removed by admin.')).toBe(true);
    expect((await request(app).get('/api/admin/content-reports/summary').set(auth(admin))).body.open).toBe(0);
  });
});
