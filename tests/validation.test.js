import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'validation_test_jwt_secret_123';
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

describe('System Validation & Security Test Suite', () => {
  describe('Registration & Authentication Validation', () => {
    it('rejects empty registration fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: '', email: '', password: '' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });

    it('rejects invalid email formats', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Invalid Email User',
          email: 'invalid-email-format',
          password: 'Password123',
          confirmPassword: 'Password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.email).toBeDefined();
    });

    it('rejects weak passwords', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Weak Password User',
          email: 'weak@example.com',
          password: '123',
          confirmPassword: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.password).toBeDefined();
    });

    it('rejects mismatched password confirmation', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Mismatch User',
          email: 'mismatch@example.com',
          password: 'Password123',
          confirmPassword: 'DifferentPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.confirmPassword).toBeDefined();
    });

    it('handles duplicate registration email gracefully', async () => {
      const email = `dup_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'User One', email, password: 'Password123', confirmPassword: 'Password123' })
        .expect(201);

      const dupRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User Two', email, password: 'Password123', confirmPassword: 'Password123' });

      expect([400, 409]).toContain(dupRes.status);
    });

    it('rejects login with invalid email or empty password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '', password: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('Product & Service Payload Validation', () => {
    let sellerToken;
    let businessId;

    beforeAll(async () => {
      const email = `seller_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Seller User', email, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: '9841112233' });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Password123' });

      sellerToken = loginRes.body.token;

      const bizRes = await request(app)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: `Test Business ${Date.now()}`,
          category: 'Retail',
          location: 'Kathmandu',
          description: 'A complete test business description in Nepal.',
          contactEmail: email,
          phone: '9841112233',
          hours: '09:00 - 18:00',
          offeringType: 'both',
          documentUrl: 'http://example.com/doc.pdf',
        });

      businessId = bizRes.body.business.id || bizRes.body.business._id;
    });

    it('rejects negative product price', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          businessId,
          name: 'Negative Price Product',
          category: 'Retail',
          description: 'Test product with negative price',
          price: -100,
          stock: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negative/i);
    });

    it('rejects negative stock quantity', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          businessId,
          name: 'Negative Stock Product',
          category: 'Retail',
          description: 'Test product with negative stock',
          price: 500,
          stock: -5,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negative/i);
    });

    it('rejects invalid service duration (<= 0)', async () => {
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          businessId,
          name: 'Zero Duration Service',
          category: 'Services',
          description: 'Service with zero duration',
          price: 300,
          duration: 0,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Review Range & Permission Validation', () => {
    let customerToken;
    let sellerToken;
    let businessId;

    beforeAll(async () => {
      const custEmail = `cust_review_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Reviewer Cust', email: custEmail, password: 'Password123', confirmPassword: 'Password123', role: 'customer' });

      const custLogin = await request(app).post('/api/auth/login').send({ email: custEmail, password: 'Password123' });
      customerToken = custLogin.body.token;

      const sellerEmail = `seller_review_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Review Owner Seller', email: sellerEmail, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: '9845556677' });

      const sellerLogin = await request(app).post('/api/auth/login').send({ email: sellerEmail, password: 'Password123' });
      sellerToken = sellerLogin.body.token;

      const bizRes = await request(app)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: `Review Target Biz ${Date.now()}`,
          category: 'Services',
          location: 'Pokhara',
          description: 'Test business for review validation.',
          contactEmail: sellerEmail,
          phone: '9845556677',
          hours: '09:00 - 18:00',
          offeringType: 'both',
          documentUrl: 'http://example.com/doc.pdf',
        });

      businessId = bizRes.body.business.id || bizRes.body.business._id;
    });

    it('rejects invalid rating outside 1..5 range', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          businessId,
          targetId: businessId,
          targetType: 'business',
          rating: 6,
          comment: 'Invalid rating of 6 out of 5',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/between 1 and 5/i);
    });

    it('rejects empty review text', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          businessId,
          targetId: businessId,
          targetType: 'business',
          rating: 4,
          comment: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/empty|characters/i);
    });

    it('prevents seller from self-reviewing their own business', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          businessId,
          targetId: businessId,
          targetType: 'business',
          rating: 5,
          comment: 'Great business owned by myself!',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/own business/i);
    });
  });

  describe('Security & Ownership Authorization Checks', () => {
    let seller1Token;
    let seller2Token;
    let product1Id;

    beforeAll(async () => {
      const email1 = `seller1_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Seller 1', email: email1, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: '9849991111' });

      const login1 = await request(app).post('/api/auth/login').send({ email: email1, password: 'Password123' });
      seller1Token = login1.body.token;

      const biz1 = await request(app)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          name: `Biz 1 ${Date.now()}`,
          category: 'Retail',
          location: 'Kathmandu',
          description: 'Description for Biz 1 by Seller 1.',
          contactEmail: email1,
          phone: '9849991111',
          hours: '09:00 - 18:00',
          offeringType: 'both',
          documentUrl: 'http://example.com/doc.pdf',
        });

      const b1Id = biz1.body.business.id || biz1.body.business._id;

      const p1 = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          businessId: b1Id,
          name: 'Product Belonging to Seller 1',
          category: 'Retail',
          description: 'Unique product for seller 1 ownership check',
          price: 1500,
          stock: 20,
        });

      product1Id = p1.body.product._id;

      const email2 = `seller2_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Seller 2', email: email2, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: '9849992222' });

      const login2 = await request(app).post('/api/auth/login').send({ email: email2, password: 'Password123' });
      seller2Token = login2.body.token;
    });

    it('prevents seller 2 from editing seller 1 product', async () => {
      const res = await request(app)
        .put(`/api/products/${product1Id}`)
        .set('Authorization', `Bearer ${seller2Token}`)
        .send({ price: 1 });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/do not own/i);
    });

    it('prevents seller 2 from deleting seller 1 product', async () => {
      const res = await request(app)
        .delete(`/api/products/${product1Id}`)
        .set('Authorization', `Bearer ${seller2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/do not own/i);
    });
  });
});
