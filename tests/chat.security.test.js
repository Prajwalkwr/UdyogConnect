import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'chat_security_test_secret';
  process.env.NODE_ENV = 'test';
  process.env.SEED_DEMO = 'true';

  const dbModule = await import('../server/db.js');
  await dbModule.connectDb();

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
  return res.body;
}

describe('Conversation privacy', () => {
  let customerA;
  let customerB;
  let seller;
  let business;
  let convA;
  let convB;

  beforeAll(async () => {
    const a = await login('customer@udyog.np');
    customerA = { ...a.user, token: a.token };

    const emailB = `customer_b_${Date.now()}@udyog.np`;
    const phoneB = `98${String(Date.now()).slice(-8)}`;
    const passwordB = 'Password123';
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Customer B',
      email: emailB,
      password: passwordB,
      confirmPassword: passwordB,
      phone: phoneB,
      role: 'customer',
    });
    expect([200, 201]).toContain(reg.status);
    if (reg.body?.token) {
      customerB = { ...reg.body.user, token: reg.body.token };
    } else {
      const verifyOtp = reg.body?.otp || reg.body?.verificationOtp;
      if (verifyOtp) {
        await request(app).post('/api/auth/verify').send({ email: emailB, otp: verifyOtp });
      }
      const bLogin = await request(app).post('/api/auth/login').send({ email: emailB, password: passwordB });
      expect(bLogin.status).toBe(200);
      customerB = { ...bLogin.body.user, token: bLogin.body.token };
    }

    const s = await login('seller@udyog.np');
    seller = { ...s.user, token: s.token };

    const businesses = await request(app).get('/api/businesses');
    const list = Array.isArray(businesses.body) ? businesses.body : (businesses.body?.businesses || []);
    business = list.find((b) => b.name === 'The Himalayan Café') || list[0];
    expect(business).toBeTruthy();

    // Ensure the logged-in seller owns this business (mongo seed may keep legacy ownerId strings)
    const { Business } = await import('../server/db.js');
    const BusinessMDL = Business();
    await BusinessMDL.findByIdAndUpdate(business._id, { ownerId: String(seller._id || seller.id) });
    business.ownerId = String(seller._id || seller.id);
  }, 60000);

  it('creates separate conversations per customer for the same business', async () => {
    const resA = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({ businessId: business._id });
    expect(resA.status).toBe(200);
    convA = resA.body.conversation;
    expect(String(convA.customerId)).toBe(String(customerA._id || customerA.id));

    if (!customerB?.token) return;

    const resB = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${customerB.token}`)
      .send({ businessId: business._id });
    expect(resB.status).toBe(200);
    convB = resB.body.conversation;
    expect(String(convA._id)).not.toBe(String(convB._id));
  });

  it('reuses the same conversation on repeated open', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({ businessId: business._id });
    expect(res.status).toBe(200);
    expect(String(res.body.conversation._id)).toBe(String(convA._id));
  });

  it('forbids customer A from reading customer B conversation', async () => {
    if (!convB) return;
    const res = await request(app)
      .get(`/api/conversations/${convB._id}/messages`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(res.status).toBe(403);
  });

  it('ignores spoofed customerId from body', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({ businessId: business._id, customerId: 'someone-else' });
    expect(res.status).toBe(200);
    expect(String(res.body.conversation.customerId)).toBe(String(customerA._id || customerA.id));
  });

  it('allows business owner to list both conversations', async () => {
    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${seller.token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.conversations || []).map((c) => String(c._id));
    expect(ids).toContain(String(convA._id));
    if (convB) expect(ids).toContain(String(convB._id));
  });

  it('keeps message text private between customers', async () => {
    if (!convB) return;

    await request(app)
      .post(`/api/conversations/${convA._id}/messages`)
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({ message: 'Hello from A', clientMessageId: `a-${Date.now()}` });

    await request(app)
      .post(`/api/conversations/${convB._id}/messages`)
      .set('Authorization', `Bearer ${customerB.token}`)
      .send({ message: 'Hello from B', clientMessageId: `b-${Date.now()}` });

    const aMsgs = await request(app)
      .get(`/api/conversations/${convA._id}/messages`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(aMsgs.status).toBe(200);
    const aTexts = (aMsgs.body.messages || []).map((m) => m.message);
    expect(aTexts).toContain('Hello from A');
    expect(aTexts).not.toContain('Hello from B');

    const leak = await request(app)
      .get(`/api/conversations/${convB._id}/messages`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(leak.status).toBe(403);
  });
});
