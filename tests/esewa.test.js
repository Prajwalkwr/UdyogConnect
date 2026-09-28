import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';

// Load server-side modules through the same require cache the server uses.
const serverRequire = createRequire(new URL('../server/server.js', import.meta.url));
const esewa = serverRequire('./payments/esewa');
const { encryptSecret, decryptSecret } = serverRequire('./payments/secretBox');

const MERCHANT = 'EPAYTEST';
const SECRET = '8gBm/:&EnhH.1/q';

let mongo;
let app;
let statusReply = { status: 'COMPLETE' };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'esewa_test_secret';
  process.env.NODE_ENV = 'test';
  process.env.SEED_DEMO = 'true';
  process.env.ESEWA_ENV = 'sandbox';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_USER = 'bills@test.local';
  process.env.SMTP_PASS = 'test-pass';

  const nodemailer = serverRequire('nodemailer');
  nodemailer.createTransport = () => ({ verify: async () => true, sendMail: async () => ({ messageId: 'test' }) });

  esewa.setStatusFetcher(async (url) => {
    const params = new URL(url).searchParams;
    return {
      product_code: params.get('product_code'),
      transaction_uuid: params.get('transaction_uuid'),
      total_amount: params.get('total_amount'),
      ref_id: 'REF-TEST-1',
      ...statusReply,
    };
  });

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
  return { ...res.body.user, token: res.body.token };
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

/** Builds the base64 `data` payload eSewa appends to the success URL. */
function callbackData(fields, secret = SECRET, overrides = {}) {
  const names = 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
  const data = {
    transaction_code: '000AWEO',
    status: 'COMPLETE',
    total_amount: fields.total_amount,
    transaction_uuid: fields.transaction_uuid,
    product_code: fields.product_code,
    signed_field_names: names,
  };
  data.signature = esewa.signFields(secret, data, names);
  return Buffer.from(JSON.stringify({ ...data, ...overrides })).toString('base64');
}

describe('eSewa helpers', () => {
  it('signs the eSewa message format "field=value,..." with HMAC-SHA256 base64', () => {
    const signature = esewa.signFields(SECRET, {
      total_amount: '110',
      transaction_uuid: '11-201-13',
      product_code: 'EPAYTEST',
    }, 'total_amount,transaction_uuid,product_code');
    const expected = crypto.createHmac('sha256', SECRET)
      .update('total_amount=110,transaction_uuid=11-201-13,product_code=EPAYTEST')
      .digest('base64');
    expect(signature).toBe(expected);
  });

  it('encrypts merchant secrets so the stored value never contains the key', () => {
    const stored = encryptSecret(SECRET);
    expect(stored).not.toContain(SECRET);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptSecret(stored)).toBe(SECRET);
    expect(encryptSecret(SECRET)).not.toBe(stored);
  });

  it('splits totals so amount + tax + delivery equals total_amount', () => {
    const { fields } = esewa.buildPaymentForm({
      merchantCode: MERCHANT,
      secretKey: SECRET,
      environment: 'sandbox',
      transactionUuid: 'UC-TEST-1',
      totals: { total: 1200.5, tax: 138.1, deliveryFee: 70 },
      successUrl: 'http://localhost/s',
      failureUrl: 'http://localhost/f',
    });
    const sum = Number(fields.amount) + Number(fields.tax_amount) + Number(fields.product_delivery_charge) + Number(fields.product_service_charge);
    expect(Math.round(sum * 100) / 100).toBe(Number(fields.total_amount));
    expect(esewa.parseAmount('1,200.5')).toBe(1200.5);
  });
});

describe('Multi-vendor eSewa checkout', () => {
  let customer;
  let otherCustomer;
  let seller;
  let business;
  let product;

  beforeAll(async () => {
    customer = await login('customer@udyog.np');
    seller = await login('seller@udyog.np');
    otherCustomer = await login('admin@udyog.np');

    const { Business, Product } = await import('../server/db.js');
    business = await Business().findOne({}).lean();
    const seeded = await Product().findOne({}).lean();
    await Business().findByIdAndUpdate(business._id, { ownerId: String(seller._id || seller.id) });
    await Product().findByIdAndUpdate(seeded._id, { stock: 1000, availability: true, businessId: String(business._id) });
    product = { ...seeded, _id: String(seeded._id), businessId: String(business._id) };
  }, 60000);

  const cart = () => ({
    businessId: product.businessId,
    items: [{ id: product._id, name: product.name, type: 'product', quantity: 1, price: 1 }],
    deliveryAddress,
  });

  const startEsewa = (key) => request(app)
    .post('/api/checkout/esewa')
    .set(auth(customer))
    .set('Idempotency-Key', key)
    .send(cart());

  it('refuses eSewa checkout until the business connects its merchant account', async () => {
    const res = await startEsewa(`esewa-off-${Date.now()}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not accept eSewa/i);
  });

  it('lets only the owner connect eSewa and never returns the secret key', async () => {
    const denied = await request(app).post('/api/business/payment/connect').set(auth(customer))
      .send({ businessId: product.businessId, merchantCode: MERCHANT, secretKey: SECRET });
    expect(denied.status).toBe(403);

    const res = await request(app).post('/api/business/payment/connect').set(auth(seller))
      .send({ businessId: product.businessId, merchantCode: MERCHANT, secretKey: SECRET });
    expect(res.status).toBe(200);
    expect(res.body.settings.isConnected).toBe(true);
    expect(res.body.settings.hasSecretKey).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);

    const settings = await request(app).get(`/api/business/payment/settings?businessId=${product.businessId}`).set(auth(seller));
    expect(settings.status).toBe(200);
    expect(JSON.stringify(settings.body)).not.toContain(SECRET);

    const { PaymentCredential } = await import('../server/db.js');
    const credential = await PaymentCredential().findOne({ businessId: product.businessId }).lean();
    expect(credential.secretKeyEncrypted).not.toContain(SECRET);

    const publicBiz = await request(app).get(`/api/businesses/${product.businessId}`).set(auth(customer));
    expect(publicBiz.body.business.esewaEnabled).toBe(true);
    expect(publicBiz.body.business.paymentSettings).toEqual({ provider: 'eSewa', isConnected: true });
    expect(JSON.stringify(publicBiz.body)).not.toContain(SECRET);
  });

  it('does not accept eSewa through the regular checkout endpoint', async () => {
    const res = await request(app).post('/api/checkout').set(auth(customer))
      .set('Idempotency-Key', `esewa-plain-${Date.now()}`)
      .send({ ...cart(), paymentMethod: 'eSewa' });
    expect(res.status).toBe(400);
  });

  let form;
  let paidOrder;

  it('signs the payment with the business merchant using database prices', async () => {
    const key = `esewa-start-${Date.now()}`;
    const res = await startEsewa(key);
    expect(res.status).toBe(201);
    form = res.body.fields;
    expect(res.body.action).toContain('rc-epay.esewa.com.np');
    expect(form.product_code).toBe(MERCHANT);
    expect(Number(form.amount)).toBeGreaterThan(1);
    expect(form.signature).toBe(esewa.signFields(SECRET, form, form.signed_field_names));
    expect(JSON.stringify(res.body)).not.toContain(SECRET);

    const again = await startEsewa(key);
    expect(again.body.fields.transaction_uuid).toBe(form.transaction_uuid);

    const { Order } = await import('../server/db.js');
    expect(await Order().countDocuments({ esewaTransactionUuid: form.transaction_uuid })).toBe(0);
  });

  it('rejects a tampered amount or forged signature without creating an order', async () => {
    const tampered = await request(app).post('/api/payment/esewa/verify').set(auth(customer))
      .send({ data: callbackData({ ...form, total_amount: '1' }) });
    expect(tampered.status).toBe(400);

    const forged = await request(app).post('/api/payment/esewa/verify').set(auth(customer))
      .send({ data: callbackData(form, 'not-the-merchant-secret') });
    expect(forged.status).toBe(400);

    const wrongMerchant = await request(app).post('/api/payment/esewa/verify').set(auth(customer))
      .send({ data: callbackData({ ...form, product_code: 'OTHERSHOP' }) });
    expect(wrongMerchant.status).toBe(400);

    const { Order } = await import('../server/db.js');
    expect(await Order().countDocuments({ esewaTransactionUuid: form.transaction_uuid })).toBe(0);
  });

  it('hides the payment from other customers', async () => {
    const res = await request(app).post('/api/payment/esewa/verify').set(auth(otherCustomer))
      .send({ data: callbackData(form) });
    expect(res.status).toBe(404);
  });

  it('does not create an order when eSewa says the payment is not complete', async () => {
    statusReply = { status: 'NOT_FOUND' };
    const res = await request(app).post('/api/payment/esewa/verify').set(auth(customer))
      .send({ data: callbackData(form) });
    statusReply = { status: 'COMPLETE' };
    expect(res.status).toBe(400);
    const { Order } = await import('../server/db.js');
    expect(await Order().countDocuments({ esewaTransactionUuid: form.transaction_uuid })).toBe(0);
  });

  it('creates exactly one paid order after eSewa verification', async () => {
    const data = callbackData(form);
    const [first, second] = await Promise.all([
      request(app).post('/api/payment/esewa/verify').set(auth(customer)).send({ data }),
      request(app).post('/api/payment/esewa/verify').set(auth(customer)).send({ data }),
    ]);
    const ok = [first, second].filter((r) => [200, 201].includes(r.status));
    expect(ok.length).toBeGreaterThanOrEqual(1);
    paidOrder = ok[0].body.order;
    expect(paidOrder.paymentMethod).toBe('eSewa');
    expect(paidOrder.paymentStatus).toBe('paid');
    expect(paidOrder.status).toBe('placed');
    expect(paidOrder.businessId).toBe(product.businessId);
    expect(paidOrder.esewaTransactionUuid).toBe(form.transaction_uuid);
    expect(paidOrder.paymentTransactionId).toBe('REF-TEST-1');

    const repeat = await request(app).post('/api/payment/esewa/verify').set(auth(customer)).send({ data });
    expect(repeat.status).toBe(200);
    expect(repeat.body.order._id).toBe(paidOrder._id);

    const { Order } = await import('../server/db.js');
    expect(await Order().countDocuments({ esewaTransactionUuid: form.transaction_uuid })).toBe(1);
  });

  it('shows the new order to the business and walks it through delivery with an OTP', async () => {
    const list = await request(app).get('/api/business/orders').set(auth(seller));
    expect(list.status).toBe(200);
    expect(list.body.some((o) => o._id === paidOrder._id)).toBe(true);

    const customerAccept = await request(app).patch(`/api/orders/${paidOrder._id}/accept`).set(auth(customer));
    expect(customerAccept.status).toBe(403);

    const accept = await request(app).patch(`/api/orders/${paidOrder._id}/accept`).set(auth(seller));
    expect(accept.status).toBe(200);
    expect(accept.body.order.status).toBe('accepted');
    const acceptTwice = await request(app).patch(`/api/orders/${paidOrder._id}/accept`).set(auth(seller));
    expect(acceptTwice.status).toBe(409);

    const preparing = await request(app).patch(`/api/orders/${paidOrder._id}/preparing`).set(auth(seller));
    expect(preparing.body.order.status).toBe('preparing');

    const dispatch = await request(app).patch(`/api/orders/${paidOrder._id}/dispatch`).set(auth(seller));
    expect(dispatch.status).toBe(200);
    expect(dispatch.body.order.status).toBe('dispatched');
    expect(dispatch.body.order.deliveryOtp).toBeUndefined();

    const sellerView = await request(app).get(`/api/orders/${paidOrder._id}`).set(auth(seller));
    expect(sellerView.body.deliveryOtp).toBeUndefined();
    const customerView = await request(app).get(`/api/orders/${paidOrder._id}`).set(auth(customer));
    expect(customerView.body.deliveryOtp).toMatch(/^\d{6}$/);
    const otp = customerView.body.deliveryOtp;

    const wrongOtp = otp === '000000' ? '111111' : '000000';
    const wrong = await request(app).post(`/api/orders/${paidOrder._id}/verify-otp`).set(auth(seller)).send({ otp: wrongOtp });
    expect(wrong.status).toBe(400);
    expect(JSON.stringify(wrong.body)).not.toContain(otp);

    const right = await request(app).post(`/api/orders/${paidOrder._id}/verify-otp`).set(auth(seller)).send({ otp });
    expect(right.status).toBe(200);
    expect(right.body.order.status).toBe('completed');
  });

  it('lets the customer confirm "Order Received" and marks a COD order paid', async () => {
    const cod = await request(app).post('/api/checkout').set(auth(customer))
      .set('Idempotency-Key', `esewa-cod-${Date.now()}`)
      .send({ ...cart(), paymentMethod: 'COD' });
    expect(cod.status).toBe(201);
    const id = cod.body.order._id;

    const early = await request(app).patch(`/api/orders/${id}/order-received`).set(auth(customer));
    expect(early.status).toBe(409);

    await request(app).patch(`/api/orders/${id}/accept`).set(auth(seller));
    await request(app).patch(`/api/orders/${id}/dispatch`).set(auth(seller));

    const sellerTries = await request(app).patch(`/api/orders/${id}/order-received`).set(auth(seller));
    expect(sellerTries.status).toBe(403);

    const received = await request(app).patch(`/api/orders/${id}/order-received`).set(auth(customer));
    expect(received.status).toBe(200);
    expect(received.body.order.status).toBe('completed');
    expect(received.body.order.paymentStatus).toBe('paid');
  });

  it('completes a sandbox payment through the local simulator using normal verification', async () => {
    const start = await startEsewa(`esewa-sim-${Date.now()}`);
    expect(start.status).toBe(201);
    expect(start.body.simulator).toBe(true);
    const tx = start.body.transactionUuid;

    const details = await request(app).get(`/api/payment/esewa/simulate/${tx}`).set(auth(customer));
    expect(details.status).toBe(200);
    expect(details.body.merchantCode).toBe(MERCHANT);
    expect(JSON.stringify(details.body)).not.toContain(SECRET);
    const stranger = await request(app).get(`/api/payment/esewa/simulate/${tx}`).set(auth(otherCustomer));
    expect(stranger.status).toBe(404);

    statusReply = { status: 'NOT_FOUND' };
    const sim = await request(app).post('/api/payment/esewa/simulate').set(auth(customer)).send({ transactionUuid: tx });
    expect(sim.status).toBe(200);
    const verified = await request(app).post('/api/payment/esewa/verify').set(auth(customer)).send({ data: sim.body.data });
    statusReply = { status: 'COMPLETE' };
    expect(verified.status).toBe(201);
    expect(verified.body.order.paymentStatus).toBe('paid');
    expect(verified.body.order.paymentTransactionId).toBe(`SIM-${tx}`);

    const { Order } = await import('../server/db.js');
    expect(await Order().countDocuments({ esewaTransactionUuid: tx })).toBe(1);
  });

  it('never offers the simulator in live mode', async () => {
    const start = await startEsewa(`esewa-live-${Date.now()}`);
    const tx = start.body.transactionUuid;
    process.env.ESEWA_ENV = 'live';
    try {
      const sim = await request(app).post('/api/payment/esewa/simulate').set(auth(customer)).send({ transactionUuid: tx });
      expect(sim.status).toBe(404);
    } finally {
      process.env.ESEWA_ENV = 'sandbox';
    }
  });

  it('lets the business reject a new order with a reason', async () => {
    const cod = await request(app).post('/api/checkout').set(auth(customer))
      .set('Idempotency-Key', `esewa-reject-${Date.now()}`)
      .send({ ...cart(), paymentMethod: 'COD' });
    const res = await request(app).patch(`/api/orders/${cod.body.order._id}/reject`).set(auth(seller)).send({ reason: 'Out of stock' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('rejected');
    expect(res.body.order.rejectionReason).toBe('Out of stock');
  });
});
