import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  process.env.NODE_ENV = 'test';
  // Keep OTP optional in the main auth suite (register may or may not return otp).
  delete process.env.REQUIRE_REGISTRATION_OTP;
  process.env.DISABLE_REGISTRATION_OTP = 'true';

  // Connect DB models
  const dbModule = await import('../server/db.js');
  const connectDb = dbModule.connectDb || (dbModule.default && dbModule.default.connectDb);
  if (!connectDb) throw new Error('connectDb not found in server/db.js');
  await connectDb();

  // Import express app after DB env is set
  const serverModule = await import('../server/server.js');
  app = serverModule.app || (serverModule.default && serverModule.default.app);
  if (!app) throw new Error('Express app not found in server/server.js');
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('Auth: register and login', () => {
  it('registers a user and allows login', async () => {
    const email = `testuser+${Date.now()}@example.com`;
    const password = 'Testpass123';

    // Register
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email, password, confirmPassword: password, phone: `98${String(Date.now()).slice(-8)}` })
      .expect(201);

    expect(reg.body).toHaveProperty('success', true);
    if (reg.body.otp) {
      await request(app).post('/api/auth/verify').send({ email, otp: reg.body.otp }).expect(200);
    }

    // Login
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(login.body).toHaveProperty('token');
    expect(login.body).toHaveProperty('user');
    expect(login.body.user).toHaveProperty('email', email);
  });

  it('exposes live admin catalog and support data endpoints', async () => {
    const blocked = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin Live', email: `adminlive+${Date.now()}@example.com`, password: 'Adminpass123', confirmPassword: 'Adminpass123', phone: `97${String(Date.now()).slice(-8)}`, role: 'admin' });
    expect(blocked.status).toBe(400);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@udyog.np', password: 'password' })
      .expect(200);

    const supportRes = await request(app)
      .get('/api/admin/support-tickets')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);

    expect(Array.isArray(supportRes.body)).toBe(true);

    const servicesRes = await request(app)
      .get('/api/services')
      .expect(200);

    expect(Array.isArray(servicesRes.body)).toBe(true);
  });
});
