import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;
let UserModel;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  process.env.NODE_ENV = 'test';

  const dbModule = await import('../server/db.js');
  const connectDb = dbModule.connectDb || (dbModule.default && dbModule.default.connectDb);
  await connectDb();

  const serverModule = await import('../server/server.js');
  app = serverModule.app || (serverModule.default && serverModule.default.app);

  const models = await import('../server/db.js');
  UserModel = models.User();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('Auth extra flows', () => {
  it('requires verification before login, then verifies and allows login', async () => {
    const email = `verifyuser+${Date.now()}@example.com`;
    const password = 'Verify1234';

    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Verify User', email, password, confirmPassword: password })
      .expect(201);

    expect(reg.body).toHaveProperty('success', true);
    expect(reg.body).toHaveProperty('otp');
    const otp = reg.body.otp;

    // Login should be blocked
    const blocked = await request(app).post('/api/auth/login').send({ email, password }).expect(400);
    expect(blocked.body).toHaveProperty('requireVerification', true);

    // Verify
    const verify = await request(app).post('/api/auth/verify').send({ email, otp }).expect(200);
    expect(verify.body).toHaveProperty('success', true);

    // Now login should work
    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    expect(login.body).toHaveProperty('token');
  });

  it('supports forgot/reset password flow', async () => {
    const email = `forgotuser+${Date.now()}@example.com`;
    const password = 'Forgot1234';

    // Register
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Forgot User', email, password, confirmPassword: password })
      .expect(201);
    const otp = reg.body.otp;
    await request(app).post('/api/auth/verify').send({ email, otp }).expect(200);

    // Forgot password (get reset OTP)
    const forgot = await request(app).post('/api/auth/forgot-password').send({ emailOrPhone: email }).expect(200);
    expect(forgot.body).toHaveProperty('otp');
    const resetOtp = forgot.body.otp;

    // Reset password
    const newPass = 'NewPass1234';
    await request(app).post('/api/auth/reset-password').send({ emailOrPhone: email, otp: resetOtp, password: newPass, confirmPassword: newPass }).expect(200);

    // Login with new password
    const login = await request(app).post('/api/auth/login').send({ email, password: newPass }).expect(200);
    expect(login.body).toHaveProperty('token');
  });

  it('locks account after consecutive failed attempts', async () => {
    const email = `lockuser+${Date.now()}@example.com`;
    const password = 'Lock12345';

    // Register and verify
    const reg = await request(app).post('/api/auth/register').send({ name: 'Lock User', email, password, confirmPassword: password }).expect(201);
    const otp = reg.body.otp;
    await request(app).post('/api/auth/verify').send({ email, otp }).expect(200);

    // Try wrong password 5 times
    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
      if (i < 5) {
        expect(res.status).toBe(400);
      } else {
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Account locked|Too many failed login attempts/);
      }
    }

    // Immediately try correct password -> should be locked (403)
    const locked = await request(app).post('/api/auth/login').send({ email, password }).expect(403);
    expect(locked.body.message).toMatch(/Account locked/);
  });

  it('prevents duplicate registrations', async () => {
    const email = `dupuser+${Date.now()}@example.com`;
    const password = 'Dup12345';

    await request(app).post('/api/auth/register').send({ name: 'Dup User', email, password, confirmPassword: password }).expect(201);
    // Attempt duplicate
    const dup = await request(app).post('/api/auth/register').send({ name: 'Dup User', email, password, confirmPassword: password }).expect(409);
    expect(dup.body.message).toMatch(/already exists/);
  });

  it('rejects expired tokens and allows re-login', async () => {
    const email = `expuser+${Date.now()}@example.com`;
    const password = 'Exp12345';

    const reg = await request(app).post('/api/auth/register').send({ name: 'Exp User', email, password, confirmPassword: password }).expect(201);
    const otp = reg.body.otp;
    await request(app).post('/api/auth/verify').send({ email, otp }).expect(200);

    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    const token = login.body.token;
    // Create an expired token (exp in past)
    const jwt = (await import('jsonwebtoken')).default;
    const expired = jwt.sign({ id: login.body.user.id, email }, process.env.JWT_SECRET, { expiresIn: -10 });

    // Call protected route with expired token
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${expired}`).expect(403);

    // Re-login works
    const relogin = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    expect(relogin.body).toHaveProperty('token');
  });
});
