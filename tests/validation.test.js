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
        .send({ name: 'User One', email, password: 'Password123', confirmPassword: 'Password123', phone: `98${String(Date.now()).slice(-8)}` })
        .expect(201);

      const dupRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User Two', email, password: 'Password123', confirmPassword: 'Password123', phone: `97${String(Date.now()).slice(-8)}` });

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
      const email = `seller@${Date.now()}.com`;
      const sellerPhone = `98${String(Date.now()).slice(-8)}`;
      const sellerReg = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Seller User', email, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: sellerPhone });
      if (sellerReg.status !== 201) {
        throw new Error(`seller register ${sellerReg.status}: ${JSON.stringify(sellerReg.body)}`);
      }

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Password123' });

      sellerToken = loginRes.body.token;

      const bizRes = await request(app)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Test Business One',
          category: 'Grocery',
          location: 'Kathmandu',
          description: 'We are a trusted local business serving customers across Nepal with quality products and friendly service every day of the week. Our team focuses on fresh inventory fair pricing and reliable delivery so families and shops can depend on us. We take pride in community support careful packing clear communication and fast responses to orders questions and special requests from nearby neighborhoods and returning customers alike.',
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
        .send({ name: 'Reviewer Cust', email: custEmail, password: 'Password123', confirmPassword: 'Password123', role: 'customer', phone: `98${String(Date.now()).slice(-8)}` });

      const custLogin = await request(app).post('/api/auth/login').send({ email: custEmail, password: 'Password123' });
      customerToken = custLogin.body.token;

      const sellerEmail = `reviewseller@${Date.now()}.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Review Owner Seller', email: sellerEmail, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: `98${String(Date.now() + 11).slice(-8)}` });

      const sellerLogin = await request(app).post('/api/auth/login').send({ email: sellerEmail, password: 'Password123' });
      sellerToken = sellerLogin.body.token;

      const bizRes = await request(app)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Review Target Biz',
          category: 'Home Services',
          location: 'Pokhara',
          description: 'We are a trusted local business serving customers across Nepal with quality products and friendly service every day of the week. Our team focuses on fresh inventory fair pricing and reliable delivery so families and shops can depend on us. We take pride in community support careful packing clear communication and fast responses to orders questions and special requests from nearby neighborhoods and returning customers alike.',
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
      const email1 = `sellerone@${Date.now()}.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Seller One', email: email1, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: `98${String(Date.now() + 21).slice(-8)}` });

      const login1 = await request(app).post('/api/auth/login').send({ email: email1, password: 'Password123' });
      seller1Token = login1.body.token;

      const biz1 = await request(app)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          name: 'Biz One Seller',
          category: 'Grocery',
          location: 'Kathmandu',
          description: 'We are a trusted local business serving customers across Nepal with quality products and friendly service every day of the week. Our team focuses on fresh inventory fair pricing and reliable delivery so families and shops can depend on us. We take pride in community support careful packing clear communication and fast responses to orders questions and special requests from nearby neighborhoods and returning customers alike.',
          contactEmail: email1,
          phone: '9849991111',
          hours: '09:00 - 18:00',
          offeringType: 'both',
          documentUrl: 'http://example.com/doc.pdf',
        });

      const b1Id = biz1.body.business.id || biz1.body.business._id;
      const adminLogin = await request(app).post('/api/auth/login').send({ email: 'admin@udyog.np', password: 'password' });
      await request(app)
        .put(`/api/businesses/${b1Id}/verify`)
        .set('Authorization', `Bearer ${adminLogin.body.token}`)
        .send({ status: 'approved' });

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

      const email2 = `sellertwo@${Date.now()}.com`;
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Seller Two', email: email2, password: 'Password123', confirmPassword: 'Password123', role: 'seller', phone: `98${String(Date.now() + 31).slice(-8)}` });

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
