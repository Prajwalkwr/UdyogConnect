import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Resolve nodemailer the same way the server does (server/node_modules takes precedence).
const serverRequire = createRequire(new URL('../server/server.js', import.meta.url));

let mongo;
let app;
let OrderModel;

const sentMail = [];
let smtpShouldFail = false;

const BILL_NUMBER_PATTERN = /^UC-\d{8}-\d{6}$/;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'billing_test_secret';
  process.env.NODE_ENV = 'test';
  process.env.SEED_DEMO = 'true';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_USER = 'bills@test.local';
  process.env.SMTP_PASS = 'test-pass';

  // Capture outgoing mail instead of talking to a real SMTP server.
  const nodemailer = serverRequire('nodemailer');
  nodemailer.createTransport = () => ({
    verify: async () => true,
    sendMail: async (options) => {
      if (smtpShouldFail) throw new Error('SMTP connection refused (simulated)');
      sentMail.push(options);
      return { messageId: `test-${sentMail.length}` };
    },
  });

  const dbModule = await import('../server/db.js');
  await dbModule.connectDb();
  OrderModel = dbModule.Order;

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

async function registerCustomer() {
  const email = `bill_other_${Date.now()}@udyog.np`;
  const password = 'Password123';
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Other Customer',
    email,
    password,
    confirmPassword: password, acceptTerms: true,
    phone: `98${String(Date.now()).slice(-8)}`,
    role: 'customer',
  });
  expect([200, 201]).toContain(reg.status);
  if (reg.body?.token) return { ...reg.body.user, token: reg.body.token };
  const otp = reg.body?.otp || reg.body?.verificationOtp;
  if (otp) await request(app).post('/api/auth/verify').send({ email, otp });
  return login(email, password);
}

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

const deliveryAddress = {
  name: 'Test Customer',
  email: 'deliverybuyer7@gmail.com',
  phone: '9812345678',
  location: 'Kathmandu',
  address: 'Thamel Marg near Garden of Dreams',
  method: 'delivery',
};

describe('Automatic billing', () => {
  let customer;
  let otherCustomer;
  let admin;
  let seller;
  let product;

  beforeAll(async () => {
    customer = await login('customer@udyog.np');
    admin = await login('admin@udyog.np');
    seller = await login('seller@udyog.np');
    otherCustomer = await registerCustomer();

    const { Business, Product } = await import('../server/db.js');
    const business = await Business().findOne({}).lean();
    const seeded = await Product().findOne({}).lean();
    expect(business).toBeTruthy();
    expect(seeded).toBeTruthy();
    await Business().findByIdAndUpdate(business._id, { ownerId: String(seller._id || seller.id) });
    await Product().findByIdAndUpdate(seeded._id, { stock: 1000, availability: true, businessId: String(business._id) });
    product = { ...seeded, _id: String(seeded._id), businessId: String(business._id) };
  }, 60000);

  const checkout = (key, overrides = {}) => request(app)
    .post('/api/checkout')
    .set(auth(customer))
    .set('Idempotency-Key', key)
    .send({
      businessId: product.businessId,
      items: [{ id: product._id, name: product.name, type: 'product', quantity: 2 }],
      paymentMethod: 'COD',
      deliveryAddress,
      ...overrides,
    });

  let codOrder;

  it('creates a COD order with a UC bill number and emails it once (TEST 1)', async () => {
    const res = await checkout(`test-cod-${Date.now()}`);
    expect(res.status).toBe(201);
    codOrder = res.body.order;
    expect(res.body.bill.billNumber).toMatch(BILL_NUMBER_PATTERN);
    expect(codOrder.paymentStatus).toBe('pending');
    expect(res.body.bill.emailStatus).toBe('sent');
    expect(res.body.bill.emailSent).toBe(true);

    const mails = sentMail.filter((m) => m.subject === `UdyogConnect Bill - Order ${codOrder._id}`);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(deliveryAddress.email);
    expect(res.body.bill.emailTo).toBe(deliveryAddress.email);
    expect(mails[0].attachments[0].filename).toBe(`UdyogConnect-Bill-${res.body.bill.billNumber}.pdf`);
    expect(mails[0].attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('uses trusted database prices even when the browser sends manipulated ones', async () => {
    const res = await checkout(`test-tamper-${Date.now()}`, {
      items: [{ id: product._id, name: product.name, type: 'product', quantity: 1, price: 1, unitPrice: 1 }],
      subtotal: 1,
      total: 1,
      deliveryFee: 0,
      discount: 999,
    });
    expect(res.status).toBe(201);
    const order = res.body.order;
    const base = Number(product.price);
    const expectedUnit = Math.round((base - (base * (Number(product.discount) || 0)) / 100) * 100) / 100;
    expect(order.items[0].unitPrice).toBe(expectedUnit);
    expect(order.subtotal).toBe(expectedUnit);
    expect(order.deliveryFee).toBe(70);
    expect(order.discount).toBe(0);
    expect(order.total).toBeGreaterThan(1);
  });

  it('returns the same order for a repeated Idempotency-Key without a second bill or email (TEST 3)', async () => {
    const key = `test-dup-${Date.now()}`;
    const [first, second] = await Promise.all([checkout(key), checkout(key)]);
    const third = await checkout(key);
    for (const res of [first, second, third]) {
      expect([200, 201]).toContain(res.status);
      expect(typeof res.body).toBe('object');
    }
    const ids = new Set([first.body.order._id, second.body.order._id, third.body.order._id]);
    expect(ids.size).toBe(1);
    const billNumbers = new Set([first.body.bill.billNumber, second.body.bill.billNumber, third.body.bill.billNumber]);
    expect(billNumbers.size).toBe(1);

    const orderId = first.body.order._id;
    expect(await OrderModel().countDocuments({ checkoutKey: key })).toBe(1);
    expect(sentMail.filter((m) => m.subject.endsWith(orderId))).toHaveLength(1);
  });

  it('keeps the order when the email fails and allows a retry (TEST 4)', async () => {
    smtpShouldFail = true;
    const res = await checkout(`test-fail-${Date.now()}`);
    smtpShouldFail = false;
    expect(res.status).toBe(201);
    const orderId = res.body.order._id;
    expect(res.body.bill.billNumber).toMatch(BILL_NUMBER_PATTERN);
    expect(res.body.bill.emailSent).toBe(false);
    expect(res.body.bill.emailStatus).toBe('failed');

    const stored = await OrderModel().findById(orderId).lean();
    expect(stored).toBeTruthy();
    expect(stored.billEmailSent).toBe(false);

    const retry = await request(app).post(`/api/orders/${orderId}/send-bill`).set(auth(customer));
    expect(retry.status).toBe(200);
    expect(retry.body.bill.emailSent).toBe(true);
    expect(retry.body.bill.billNumber).toBe(res.body.bill.billNumber);

    const again = await request(app).post(`/api/orders/${orderId}/send-bill`).set(auth(customer));
    expect(again.status).toBe(200);
    expect(sentMail.filter((m) => m.subject.endsWith(orderId))).toHaveLength(1);
  });

  it('hides the bill from other customers (TEST 5)', async () => {
    const view = await request(app).get(`/api/orders/${codOrder._id}/bill`).set(auth(otherCustomer));
    expect(view.status).toBe(404);
    const download = await request(app).get(`/api/orders/${codOrder._id}/bill/download`).set(auth(otherCustomer));
    expect(download.status).toBe(404);
    const resend = await request(app).post(`/api/orders/${codOrder._id}/resend-bill`).set(auth(otherCustomer));
    expect(resend.status).toBe(404);
    const unauthenticated = await request(app).get(`/api/orders/${codOrder._id}/bill`);
    expect(unauthenticated.status).toBe(401);
  });

  it('lets admins view any bill and sellers view their own business bills without customer email (TEST 6)', async () => {
    const adminView = await request(app).get(`/api/orders/${codOrder._id}/bill`).set(auth(admin));
    expect(adminView.status).toBe(200);
    expect(adminView.body.bill.billNumber).toMatch(BILL_NUMBER_PATTERN);
    expect(adminView.body.bill.customer.email).toBe(deliveryAddress.email);

    const sellerView = await request(app).get(`/api/orders/${codOrder._id}/bill`).set(auth(seller));
    expect(sellerView.status).toBe(200);
    expect(sellerView.body.bill.customer.email).toBeFalsy();
    expect(sellerView.body.bill.email.to).toBeFalsy();
  });

  it('rejects delivery details that break the checkout format rules', async () => {
    const cases = [
      [{ email: 'buyer@yahoo.com' }, 'email'],
      [{ email: 'buyer.name@gmail.com' }, 'email'],
      [{ email: '7buyer@gmail.com' }, 'email'],
      [{ name: 'Ram 2' }, 'name'],
      [{ name: 'Ram@Shah' }, 'name'],
      [{ phone: '12345' }, 'phone'],
      [{ location: 'Kathmandu 44600' }, 'city'],
      [{ location: 'Kathmandu, Nepal' }, 'city'],
      [{ address: 'Ward 26' }, 'address'],
      [{ address: 'Near temple!' }, 'address'],
      [{ address: '', method: 'pickup' }, null],
    ];
    for (const [change, field] of cases) {
      const res = await checkout(`test-invalid-${field}-${Date.now()}-${Math.random()}`, {
        deliveryAddress: { ...deliveryAddress, ...change },
      });
      expect(res.status).toBe(400);
      if (field) expect(res.body.errors?.[field]).toBeTruthy();
    }
  });

  it('downloads a valid PDF with the bill filename (TEST 7)', async () => {
    const bill = await request(app).get(`/api/orders/${codOrder._id}/bill`).set(auth(customer));
    const res = await request(app)
      .get(`/api/orders/${codOrder._id}/bill/download`)
      .set(auth(customer))
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`attachment; filename="UdyogConnect-Bill-${bill.body.bill.billNumber}.pdf"`);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('resends with the same bill number and rate limits repeated resends (TEST 8)', async () => {
    await OrderModel().findByIdAndUpdate(codOrder._id, { $set: { billEmailLastAttemptAt: new Date(Date.now() - 5 * 60 * 1000) } });
    const before = await request(app).get(`/api/orders/${codOrder._id}/bill`).set(auth(customer));

    const resend = await request(app).post(`/api/orders/${codOrder._id}/resend-bill`).set(auth(customer));
    expect(resend.status).toBe(200);
    expect(resend.body.bill.billNumber).toBe(before.body.bill.billNumber);
    expect(sentMail.filter((m) => m.subject.endsWith(codOrder._id))).toHaveLength(2);

    const tooSoon = await request(app).post(`/api/orders/${codOrder._id}/resend-bill`).set(auth(customer));
    expect(tooSoon.status).toBe(429);
    expect(sentMail.filter((m) => m.subject.endsWith(codOrder._id))).toHaveLength(2);
  });

  it('bills card orders only after verified payment, exactly once (TEST 2)', async () => {
    const res = await checkout(`test-card-${Date.now()}`, { paymentMethod: 'Card' });
    expect(res.status).toBe(201);
    expect(res.body.requiresPayment).toBe(true);
    expect(res.body.bill.billNumber).toBeFalsy();
    const orderId = res.body.order._id;

    const early = await request(app).get(`/api/orders/${orderId}/bill`).set(auth(customer));
    expect(early.status).toBe(409);

    const session = await request(app).post('/api/payment/create-session').set(auth(customer)).send({ orderId });
    expect(session.status).toBe(200);
    const sessionId = new URL(session.body.url).searchParams.get('session_id');

    const [v1, v2] = await Promise.all([
      request(app).post('/api/payment/verify-session').set(auth(customer)).send({ sessionId, orderId }),
      request(app).post('/api/payment/verify-session').set(auth(customer)).send({ sessionId, orderId }),
    ]);
    const v3 = await request(app).post('/api/payment/verify-session').set(auth(customer)).send({ sessionId, orderId });
    for (const v of [v1, v2, v3]) {
      expect(v.status).toBe(200);
      expect(v.body.paid).toBe(true);
    }
    expect(new Set([v1.body.bill.billNumber, v2.body.bill.billNumber, v3.body.bill.billNumber]).size).toBe(1);
    expect(v3.body.bill.billNumber).toMatch(BILL_NUMBER_PATTERN);
    expect(v3.body.order.paymentStatus).toBe('paid');
    expect(sentMail.filter((m) => m.subject.endsWith(orderId))).toHaveLength(1);

    const foreign = await request(app).post('/api/payment/verify-session').set(auth(otherCustomer)).send({ sessionId, orderId });
    expect(foreign.status).toBe(404);
  });

  it('does not let customers mark their own orders as paid', async () => {
    const res = await request(app)
      .post('/api/payment/confirm')
      .set(auth(customer))
      .send({ orderId: codOrder._id, status: 'paid' });
    expect(res.status).toBe(403);
    const stored = await OrderModel().findById(codOrder._id).lean();
    expect(stored.paymentStatus).toBe('pending');
  });

  it('lets the owning seller confirm a QR payment without issuing a second bill', async () => {
    const res = await checkout(`test-qr-${Date.now()}`, { paymentMethod: 'QR' });
    expect(res.status).toBe(201);
    const orderId = res.body.order._id;
    const billNumber = res.body.bill.billNumber;
    expect(billNumber).toMatch(BILL_NUMBER_PATTERN);

    const confirm = await request(app)
      .post('/api/payment/confirm')
      .set(auth(seller))
      .send({ orderId, status: 'paid' });
    expect(confirm.status).toBe(200);
    const stored = await OrderModel().findById(orderId).lean();
    expect(stored.paymentStatus).toBe('paid');
    expect(stored.billNumber).toBe(billNumber);
    expect(sentMail.filter((m) => m.subject.endsWith(orderId))).toHaveLength(1);
  });

  it('rejects malformed order ids', async () => {
    const res = await request(app).get('/api/orders/not-an-id/bill').set(auth(admin));
    expect(res.status).toBe(400);
  });
});
