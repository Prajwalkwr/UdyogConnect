import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Regression tests that try to break the API the way an attacker would.
// If one of these fails, a security fix has been undone.

let mongo;
let app;
let db;
let server;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'security_test_jwt_secret_0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_REGISTRATION_OTP = 'true';
  delete process.env.RATE_LIMITS;

  db = await import('../server/db.js');
  await (db.connectDb || db.default.connectDb)();
  const serverModule = await import('../server/server.js');
  server = serverModule.default || serverModule;
  app = server.app;
  // server.js copies mail credentials from server/.env; these tests must never send real email.
  for (const key of ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'BREVO_API_KEY', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_PASSWORD', 'EMAIL_HOST', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
    delete process.env[key];
  }
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

let seq = 0;
const unique = () => {
  seq += 1;
  return `${Date.now()}${seq}`;
};
const nextPhone = () => `98${String(Date.now() + seq * 31).slice(-8)}`;
const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

async function registerCustomer(label = 'sec') {
  seq += 1;
  const email = `${label}${unique()}@example.com`;
  const res = await request(app).post('/api/auth/register').send({
    name: 'Security Customer',
    email,
    password: 'Password123',
    confirmPassword: 'Password123',
    acceptTerms: true,
    role: 'customer',
    phone: nextPhone(),
  });
  expect(res.status).toBe(201);
  return { email, password: 'Password123', token: res.body.token, id: String(res.body.user.id || res.body.user._id) };
}

async function login(email, password = 'password') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return { ...res.body.user, id: String(res.body.user.id || res.body.user._id), token: res.body.token };
}

describe('Hostile input', () => {
  it('ignores MongoDB operators smuggled into the login body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('answers malformed JSON with a plain 400 and no parser details', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", "password": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid request body.');
    expect(JSON.stringify(res.body)).not.toMatch(/position|Unexpected|SyntaxError|at JSON/i);
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'a'.repeat(1.5 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });

  it('rejects absurdly long passwords and names at registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'A'.repeat(200),
      email: `long${unique()}@example.com`,
      password: `Pass1${'x'.repeat(300)}`,
      confirmPassword: `Pass1${'x'.repeat(300)}`,
      acceptTerms: true,
      phone: nextPhone(),
    });
    expect(res.status).toBe(400);
  });

  it('returns JSON 404 for unknown API routes instead of the website HTML', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not leak internal error details from the health check', async () => {
    const res = await request(app).get('/api/health/status');
    expect(res.status).toBe(200);
    expect(res.body.database).not.toHaveProperty('mongoError');
  });
});

describe('Admin routes and permissions', () => {
  let customer;
  let admin;

  beforeAll(async () => {
    customer = await registerCustomer('perm');
    admin = await login('admin@udyog.np');
  });

  it('refuses admin endpoints without a token', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('grants admin only to existing accounts listed in ADMIN_EMAILS', async () => {
    const owner = await registerCustomer('owner');
    const bystander = await registerCustomer('bystander');
    process.env.ADMIN_EMAILS = ` ${owner.email.toUpperCase()} , not-an-email, missing${unique()}@example.com`;
    try {
      await server.promoteConfiguredAdmins();
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
    expect((await request(app).get('/api/admin/users').set(auth(owner))).status).toBe(200);
    expect((await request(app).get('/api/admin/users').set(auth(bystander))).status).toBe(403);
  });

  it('refuses admin endpoints to a customer', async () => {
    const checks = [
      request(app).get('/api/admin/users').set(auth(customer)),
      request(app).get('/api/admin/coupons').set(auth(customer)),
      request(app).get('/api/admin/settings').set(auth(customer)),
      request(app).put('/api/admin/settings').set(auth(customer)).send({ taxRate: 0 }),
      request(app).post('/api/admin/coupons').set(auth(customer)).send({ code: 'FREE99', discountPercent: 90, maxDiscount: 99999, expiryDate: '2099-01-01' }),
      request(app).post('/api/notifications').set(auth(customer)).send({ message: 'spam' }),
      request(app).post('/api/cloudinary/delete').set(auth(customer)).send({ public_id: 'udyogconnect/x' }),
    ];
    for (const res of await Promise.all(checks)) expect(res.status).toBe(403);
  });

  it('rejects tokens signed with the wrong secret', async () => {
    const forged = jwt.sign({ userId: admin.id, id: admin.id, role: 'admin' }, 'not-the-real-secret');
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('uses the role stored in the database, not the role claimed in the token', async () => {
    const elevated = jwt.sign({ userId: customer.id, id: customer.id, role: 'admin' }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${elevated}`);
    expect(res.status).toBe(403);
  });

  it('stops an admin from suspending or deleting their own account', async () => {
    const suspend = await request(app).put(`/api/admin/users/${admin.id}/status`).set(auth(admin)).send({ suspended: true });
    expect(suspend.status).toBe(400);
    const remove = await request(app).delete(`/api/admin/users/${admin.id}`).set(auth(admin));
    expect(remove.status).toBe(400);
  });

  it('validates admin settings', async () => {
    const res = await request(app).put('/api/admin/settings').set(auth(admin)).send({ taxRate: 500 });
    expect(res.status).toBe(400);
    const ok = await request(app).put('/api/admin/settings').set(auth(admin)).send({ taxRate: 13, deliveryFee: 70 });
    expect(ok.status).toBe(200);
  });

  it('sends admin announcements (validated)', async () => {
    expect((await request(app).post('/api/notifications').set(auth(admin)).send({ message: '' })).status).toBe(400);
    expect((await request(app).post('/api/notifications').set(auth(admin)).send({ title: 'Hello', message: 'Platform update' })).status).toBe(200);
  });
});

describe('Coupons', () => {
  let customer;
  let admin;
  const code = `SAFE${String(Date.now()).slice(-6)}`;

  beforeAll(async () => {
    customer = await registerCustomer('coupon');
    admin = await login('admin@udyog.np');
  });

  it('rejects unsafe coupon values', async () => {
    const res = await request(app).post('/api/admin/coupons').set(auth(admin)).send({ code, discountPercent: 500, maxDiscount: 100, expiryDate: '2099-12-31' });
    expect(res.status).toBe(400);
  });

  it('lets a shopper check one code without seeing the coupon list', async () => {
    const created = await request(app).post('/api/admin/coupons').set(auth(admin)).send({ code, discountPercent: 10, maxDiscount: 200, expiryDate: '2099-12-31' });
    expect(created.status).toBe(201);

    const valid = await request(app).get('/api/coupons/validate').query({ code: code.toLowerCase() }).set(auth(customer));
    expect(valid.status).toBe(200);
    expect(Object.keys(valid.body).sort()).toEqual(['code', 'discountPercent', 'expiryDate', 'maxDiscount']);

    const invalid = await request(app).get('/api/coupons/validate').query({ code: 'NOPE-NOT-REAL' }).set(auth(customer));
    expect(invalid.status).toBe(404);
  });
});

describe('Sessions and accounts', () => {
  let admin;

  beforeAll(async () => {
    admin = await login('admin@udyog.np');
  });

  it('blocks a suspended account immediately, including its existing session', async () => {
    const user = await registerCustomer('suspend');
    expect((await request(app).get('/api/auth/profile').set(auth(user))).status).toBe(200);

    expect((await request(app).put(`/api/admin/users/${user.id}/status`).set(auth(admin)).send({ suspended: true })).status).toBe(200);
    const blocked = await request(app).get('/api/auth/profile').set(auth(user));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_SUSPENDED');

    // A password reset must not lift a suspension (it clears login locks, not status).
    await db.User().findByIdAndUpdate(user.id, { lockUntil: null, failedLoginAttempts: 0 });
    const relogin = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(relogin.status).toBe(403);

    expect((await request(app).put(`/api/admin/users/${user.id}/status`).set(auth(admin)).send({ suspended: false })).status).toBe(200);
    expect((await request(app).get('/api/auth/profile').set(auth(user))).status).toBe(200);
  });

  it('rejects the session of a deleted account', async () => {
    const user = await registerCustomer('deleted');
    expect((await request(app).delete(`/api/admin/users/${user.id}`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/auth/profile').set(auth(user))).status).toBe(401);
  });

  it('signs out old sessions when the password is changed', async () => {
    const user = await registerCustomer('pwchange');
    // Token issue times have one-second resolution.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const changed = await request(app).put('/api/auth/password').set(auth(user)).send({
      currentPassword: user.password,
      newPassword: 'NewPassword456',
      confirmPassword: 'NewPassword456',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.token).toBeTruthy();

    expect((await request(app).get('/api/auth/profile').set(auth(user))).status).toBe(401);
    expect((await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${changed.body.token}`)).status).toBe(200);
  });

  it('does not let a profile update switch on 2FA flags or store payment cards', async () => {
    const user = await registerCustomer('profile');
    const res = await request(app).put('/api/auth/profile').set(auth(user)).send({
      twoFactorEnabled: true,
      paymentMethods: [{ brand: 'Visa', number: '4242424242424242' }],
    });
    expect(res.status).toBe(200);
    const stored = await db.User().findById(user.id).lean();
    expect(stored.twoFactorEnabled).toBe(false);
    expect(stored.paymentMethods || []).toHaveLength(0);
  });

  it('keeps profile emails valid and unique', async () => {
    const first = await registerCustomer('owner');
    const second = await registerCustomer('taker');
    expect((await request(app).put('/api/auth/profile').set(auth(second)).send({ email: first.email })).status).toBe(409);
    expect((await request(app).put('/api/auth/profile').set(auth(second)).send({ email: 'not-an-email' })).status).toBe(400);
  });

  it('never returns password hashes or activation codes', async () => {
    const user = await registerCustomer('leak');
    const profile = await request(app).get('/api/auth/profile').set(auth(user));
    expect(profile.body).not.toHaveProperty('password');
    expect(profile.body).not.toHaveProperty('verificationOtp');
    const users = await request(app).get('/api/admin/users').set(auth(admin));
    for (const account of users.body) {
      expect(account).not.toHaveProperty('password');
      expect(account).not.toHaveProperty('passwordResetTokenHash');
    }
  });
});

describe('File uploads', () => {
  let customer;
  const savedFiles = [];

  beforeAll(async () => {
    customer = await registerCustomer('upload');
  });

  afterAll(() => {
    for (const url of savedFiles) {
      const file = path.join(process.cwd(), 'server', url);
      if (url.startsWith('/uploads/') && fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('rejects a script disguised as a JPG', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .set(auth(customer))
      .attach('image', Buffer.from('<script>alert(document.cookie)</script>'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('rejects HTML sent as a base64 image', async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from('<html><body>phish</body></html>').toString('base64')}`;
    const res = await request(app).post('/api/upload/image-base64').set(auth(customer)).send({ dataUrl });
    expect(res.status).toBe(400);
  });

  it('rejects files over the size limit', async () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(9 * 1024 * 1024)]);
    const res = await request(app).post('/api/upload/image').set(auth(customer)).attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
  });

  it('accepts a real image and serves it so it can never run as a page', async () => {
    const res = await request(app).post('/api/upload/image').set(auth(customer)).attach('image', PNG_1X1, { filename: 'evil.html', contentType: 'text/html' });
    expect(res.status).toBe(201);
    const url = res.body.url;
    savedFiles.push(url);
    if (url.startsWith('/uploads/')) {
      expect(url).toMatch(/\.png$/);
      const served = await request(app).get(url);
      expect(served.status).toBe(200);
      expect(served.headers['content-security-policy']).toMatch(/sandbox/);
      expect(served.headers['cache-control']).toMatch(/max-age=\d+/);
    }
  });

  it('answers a missing upload with 404, not the website page', async () => {
    const res = await request(app).get('/uploads/does-not-exist-0000.jpg');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).not.toMatch(/html/);
  });

  it('requires login to upload', async () => {
    const res = await request(app).post('/api/upload/image').attach('image', PNG_1X1, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});

describe('Payments and order rules', () => {
  let customer;
  let seller;
  let admin;
  let product;

  beforeAll(async () => {
    customer = await registerCustomer('payer');
    seller = await login('seller@udyog.np');
    admin = await login('admin@udyog.np');
    const business = await db.Business().findOne({}).lean();
    const seeded = await db.Product().findOne({}).lean();
    await db.Business().findByIdAndUpdate(business._id, { ownerId: seller.id, approvalStatus: 'approved', verified: 'verified', isVerified: true });
    await db.Product().findByIdAndUpdate(seeded._id, { stock: 1000, availability: true, businessId: String(business._id) });
    product = { _id: String(seeded._id), name: seeded.name, businessId: String(business._id) };
  }, 60000);

  const placeOrder = async () => {
    const res = await request(app)
      .post('/api/checkout')
      .set(auth(customer))
      .set('Idempotency-Key', `sec-${unique()}`)
      .send({
        businessId: product.businessId,
        items: [{ id: product._id, name: product.name, type: 'product', quantity: 1 }],
        paymentMethod: 'COD',
        deliveryAddress: { name: 'Pay Tester', email: 'paytester7@gmail.com', phone: '9812345678', location: 'Kathmandu', address: 'Thamel Marg near Garden of Dreams', method: 'delivery' },
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.order;
  };

  it('does not let a customer confirm their own payment', async () => {
    const order = await placeOrder();
    const res = await request(app).post('/api/payment/confirm').set(auth(customer)).send({ orderId: order._id, status: 'paid' });
    expect(res.status).toBe(403);
  });

  it('does not let a seller mark an online (eSewa) payment as paid', async () => {
    const order = await placeOrder();
    await db.Order().findByIdAndUpdate(order._id, { paymentMethod: 'eSewa' });
    const res = await request(app).post('/api/payment/confirm').set(auth(seller)).send({ orderId: order._id, status: 'paid' });
    expect(res.status).toBe(403);
  });

  it('locks a paid order: only an admin can change or refund it', async () => {
    const order = await placeOrder();
    const unpaidRefund = await request(app).post('/api/payment/confirm').set(auth(admin)).send({ orderId: order._id, status: 'refunded' });
    expect(unpaidRefund.status).toBe(409);

    expect((await request(app).post('/api/payment/confirm').set(auth(seller)).send({ orderId: order._id, status: 'paid' })).status).toBe(200);
    expect((await request(app).post('/api/payment/confirm').set(auth(seller)).send({ orderId: order._id, status: 'pending' })).status).toBe(403);
    expect((await request(app).post('/api/payment/confirm').set(auth(admin)).send({ orderId: order._id, status: 'refunded' })).status).toBe(200);
  });

  it('does not let a seller reopen a cancelled order', async () => {
    const order = await placeOrder();
    await db.Order().findByIdAndUpdate(order._id, { status: 'cancelled' });
    const res = await request(app).put(`/api/orders/${order._id}/status`).set(auth(seller)).send({ status: 'accepted' });
    expect(res.status).toBe(409);
  });

  it('rejects a Stripe webhook without a valid signature', async () => {
    const res = await request(app)
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed', data: { object: { metadata: { orderId: 'x' } } } }));
    // 400 = bad signature; 501 = webhook not configured on this server. Never accepted.
    expect([400, 501]).toContain(res.status);
  });
});

describe('Rate limits', () => {
  it('slows down repeated wrong-password attempts', async () => {
    const previous = process.env.RATE_LIMITS;
    process.env.RATE_LIMITS = 'on';
    try {
      const email = `ratelimit${unique()}@example.com`;
      const statuses = [];
      for (let i = 0; i < 12; i += 1) {
        const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword1' });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
      expect(statuses[11]).toBe(429);
    } finally {
      if (previous === undefined) delete process.env.RATE_LIMITS;
      else process.env.RATE_LIMITS = previous;
    }
  });
});
