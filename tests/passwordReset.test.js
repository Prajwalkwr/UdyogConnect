import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Resolve nodemailer the same way the server does (server/node_modules takes precedence).
const serverRequire = createRequire(new URL('../server/server.js', import.meta.url));

const RESET_MESSAGE = 'If an account with this email exists, a password reset link has been sent.';
const FRONTEND_URL = 'https://udyog.example';

let mongo;
let app;
let dbModule;
const sentMail = [];
let smtpShouldFail = false;
let seq = 0;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'password_reset_test_secret';
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_REGISTRATION_OTP = 'true';
  process.env.FRONTEND_URL = FRONTEND_URL;
  process.env.PASSWORD_RESET_IP_LIMIT = '60';
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  process.env.EMAIL_USER = 'reset@test.local';
  process.env.EMAIL_PASS = 'test-pass';

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

  dbModule = await import('../server/db.js');
  await dbModule.connectDb();
  const serverModule = await import('../server/server.js');
  app = serverModule.app || serverModule.default?.app;
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const uniquePhone = () => `98${String(Date.now() + (seq += 1)).slice(-8)}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const tokenFrom = (mail) => (String(mail?.html || '').match(/\/reset-password\/([a-f0-9]{64})/) || [])[1];
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const findUser = (email) => dbModule.User().findOne({ email }).lean();

async function registerCustomer(password = 'Oldpass123') {
  const email = `reset${Date.now()}${(seq += 1)}@example.com`;
  const res = await request(app).post('/api/auth/register').send({
    name: 'Reset Customer', email, password, confirmPassword: password, role: 'customer', phone: uniquePhone(),
  });
  expect(res.status).toBe(201);
  return { email, password, userId: String(res.body.user.id || res.body.user._id) };
}

async function registerSeller(password = 'Shoppass123') {
  const email = `resetshop@${Date.now()}${(seq += 1)}.com`;
  const res = await request(app).post('/api/auth/register').send({
    name: 'Reset Shop', email, password, confirmPassword: password, role: 'seller', businessOfferingType: 'both', phone: uniquePhone(),
  });
  expect(res.status).toBe(201);
  return { email, password };
}

async function requestReset(email) {
  const before = sentMail.length;
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  return { res, mail: sentMail.slice(before) };
}

const verify = (token) => request(app).get(`/api/auth/reset-password/verify/${token}`);
const reset = (token, password, confirmPassword = password) => request(app)
  .post('/api/auth/reset-password')
  .send({ token, password, confirmPassword });

describe('Password reset', () => {
  it('lets a customer reset their password from the emailed link, once', async () => {
    const account = await registerCustomer();
    const oldSession = jwt.sign(
      { userId: account.userId, id: account.userId, role: 'customer', iat: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET,
    );
    expect((await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${oldSession}`)).status).toBe(200);

    const { res, mail } = await requestReset(account.email);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(RESET_MESSAGE);
    expect(JSON.stringify(res.body)).not.toMatch(/[a-f0-9]{64}/);

    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe(account.email);
    expect(mail[0].subject).toBe('Reset Your UdyogConnect Password');
    expect(mail[0].text).toContain('This link will expire in 30 minutes.');
    const token = tokenFrom(mail[0]);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mail[0].html).toContain(`${FRONTEND_URL}/reset-password/${token}`);

    // Only a hash of the token is stored, and it expires in 30 minutes.
    const stored = await findUser(account.email);
    expect(stored.passwordResetTokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    const minutesLeft = (new Date(stored.passwordResetExpires).getTime() - Date.now()) / 60000;
    expect(minutesLeft).toBeGreaterThan(29);
    expect(minutesLeft).toBeLessThanOrEqual(30);

    // Reset fields never leave the server.
    const beforeReset = await login(account.email, account.password);
    expect(beforeReset.status).toBe(200);
    for (const field of ['password', 'passwordResetTokenHash', 'passwordResetExpires', 'passwordResetRequestedAt']) {
      expect(beforeReset.body.user).not.toHaveProperty(field);
    }

    expect((await verify(token)).body).toMatchObject({ valid: true });

    const mismatch = await reset(token, 'Newpass123!', 'Other456!');
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.message).toBe('Passwords do not match.');
    expect((await reset(token, 'short1')).status).toBe(400);
    expect((await reset(token, 'onlyletters')).status).toBe(400);

    const done = await reset(token, 'Newpass123!');
    expect(done.status).toBe(200);
    expect(done.body.message).toBe('Your password has been successfully changed.');
    expect(JSON.stringify(done.body)).not.toContain('Newpass123!');

    expect((await login(account.email, account.password)).status).toBe(400);
    const fresh = await login(account.email, 'Newpass123!');
    expect(fresh.status).toBe(200);

    // Sessions from before the reset are signed out; the new one works.
    const stale = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${oldSession}`);
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('PASSWORD_CHANGED');
    expect((await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${fresh.body.token}`)).status).toBe(200);

    // The same link cannot be used again.
    expect((await verify(token)).body).toMatchObject({ valid: false, reason: 'invalid' });
    expect((await reset(token, 'Another123!')).status).toBe(400);
    expect((await login(account.email, 'Newpass123!')).status).toBe(200);

    const cleared = await findUser(account.email);
    expect(cleared.passwordResetTokenHash).toBeNull();
    expect(cleared.passwordResetExpires).toBeNull();

    const logs = await dbModule.AuditLog().find({ userId: account.userId }).lean();
    const actions = logs.map((log) => log.action);
    expect(actions).toEqual(expect.arrayContaining(['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED']));
    expect(JSON.stringify(logs)).not.toContain(token);
    expect(JSON.stringify(logs)).not.toContain('Newpass123!');
  });

  it('gives the same answer for unknown emails and normalizes the address', async () => {
    const unknown = await requestReset(`nobody${Date.now()}@example.com`);
    expect(unknown.res.status).toBe(200);
    expect(unknown.res.body.message).toBe(RESET_MESSAGE);
    expect(unknown.mail).toHaveLength(0);

    const account = await registerCustomer();
    const known = await requestReset(`  ${account.email.toUpperCase()} `);
    expect(known.res.status).toBe(200);
    expect(known.res.body).toEqual(unknown.res.body);
    expect(known.mail).toHaveLength(1);
    expect(known.mail[0].to).toBe(account.email);
  });

  it('rejects a missing or malformed email', async () => {
    for (const email of ['', '   ', 'not-an-email', { $ne: null }]) {
      const res = await request(app).post('/api/auth/forgot-password').send({ email });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Please enter a valid email address.');
    }
  });

  it('refuses expired and tampered links', async () => {
    const account = await registerCustomer();
    const { mail } = await requestReset(account.email);
    const token = tokenFrom(mail[0]);

    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect((await verify(tampered)).body).toMatchObject({ valid: false, reason: 'invalid' });
    expect((await reset(tampered, 'Newpass123!')).status).toBe(400);
    expect((await verify('abc')).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ token: { $ne: null }, password: 'Newpass123!' })).status).toBe(400);

    await dbModule.User().updateOne({ email: account.email }, { $set: { passwordResetExpires: new Date(Date.now() - 1000) } });
    const expired = await verify(token);
    expect(expired.status).toBe(400);
    expect(expired.body).toMatchObject({ valid: false, reason: 'expired', message: 'Your password reset link has expired.' });
    expect((await reset(token, 'Newpass123!')).body.reason).toBe('expired');
    expect((await login(account.email, account.password)).status).toBe(200);
  });

  it('ignores a double click and lets only the newest link work', async () => {
    const account = await registerCustomer();
    const first = await requestReset(account.email);
    const token1 = tokenFrom(first.mail[0]);

    const doubleClick = await requestReset(account.email);
    expect(doubleClick.res.status).toBe(200);
    expect(doubleClick.res.body.message).toBe(RESET_MESSAGE);
    expect(doubleClick.mail).toHaveLength(0);
    expect((await verify(token1)).body.valid).toBe(true);

    await dbModule.User().updateOne({ email: account.email }, { $set: { passwordResetRequestedAt: new Date(Date.now() - 2 * 60 * 1000) } });
    const second = await requestReset(account.email);
    const token2 = tokenFrom(second.mail[0]);
    expect(token2).toBeTruthy();
    expect(token2).not.toBe(token1);

    expect((await verify(token1)).body.valid).toBe(false);
    expect((await verify(token2)).body.valid).toBe(true);
  });

  it('works the same for business accounts', async () => {
    const seller = await registerSeller();
    const { mail } = await requestReset(seller.email);
    expect(mail).toHaveLength(1);
    const token = tokenFrom(mail[0]);

    expect((await reset(token, 'Shopnew456')).status).toBe(200);
    expect((await login(seller.email, seller.password)).status).toBe(400);
    const fresh = await login(seller.email, 'Shopnew456');
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.role).toBe('seller');
  });

  it('shows a generic error when the email cannot be sent and allows an immediate retry', async () => {
    const account = await registerCustomer();
    smtpShouldFail = true;
    const failed = await requestReset(account.email);
    smtpShouldFail = false;
    expect(failed.res.status).toBe(503);
    expect(failed.res.body.message).toBe("We couldn't process the request right now. Please try again later.");
    expect(JSON.stringify(failed.res.body)).not.toMatch(/SMTP|refused/i);

    const stored = await findUser(account.email);
    expect(stored.passwordResetTokenHash).toBeNull();

    const retry = await requestReset(account.email);
    expect(retry.res.status).toBe(200);
    expect(retry.mail).toHaveLength(1);
  });

  it('limits repeated requests for one email address', async () => {
    const email = `limit${Date.now()}@example.com`;
    for (let i = 0; i < 5; i += 1) {
      expect((await requestReset(email)).res.status).toBe(200);
    }
    const blocked = await requestReset(email);
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.body.message).toBe('Too many requests. Please try again later.');
  });

  it('limits reset requests from one IP address', async () => {
    let status = 200;
    for (let i = 0; i < 80 && status !== 429; i += 1) {
      status = (await requestReset(`ip${Date.now()}${i}@example.com`)).res.status;
    }
    expect(status).toBe(429);
  });
});

describe('Password reset links', () => {
  const { resolveFrontendUrl, buildResetEmail } = serverRequire('./auth/passwordReset.js');
  const withEnv = (vars, fn) => {
    const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
    Object.entries(vars).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    try { return fn(); } finally {
      Object.entries(saved).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    }
  };
  const req = (origin) => ({ headers: origin ? { origin } : {} });

  it('uses FRONTEND_URL and never trusts the request origin in production', () => {
    withEnv({ NODE_ENV: 'production', FRONTEND_URL: 'https://udyog.example/', CLIENT_URL: undefined }, () => {
      expect(resolveFrontendUrl(req('https://evil.example'))).toBe('https://udyog.example');
    });
    withEnv({ NODE_ENV: 'production', FRONTEND_URL: undefined, CLIENT_URL: undefined }, () => {
      expect(resolveFrontendUrl(req('https://evil.example'))).toBeNull();
    });
    withEnv({ NODE_ENV: 'production', FRONTEND_URL: 'http://localhost:5173', CLIENT_URL: undefined }, () => {
      expect(resolveFrontendUrl(req())).toBeNull();
    });
  });

  it('falls back to the local dev site only outside production', () => {
    withEnv({ NODE_ENV: 'development', FRONTEND_URL: undefined, CLIENT_URL: undefined, RENDER: undefined }, () => {
      expect(resolveFrontendUrl(req('http://localhost:5174'))).toBe('http://localhost:5174');
      expect(resolveFrontendUrl(req('https://evil.example'))).toBe('http://localhost:5174');
    });
  });

  it('builds the branded email with the link and expiry', () => {
    const email = buildResetEmail('https://udyog.example/reset-password/abc');
    expect(email.subject).toBe('Reset Your UdyogConnect Password');
    expect(email.html).toContain('href="https://udyog.example/reset-password/abc"');
    expect(email.html).toContain('Reset Password');
    expect(email.text).toContain('If you did not request a password reset, you can safely ignore this email.');
    expect(email.text).toContain('For security, never share this link with anyone.');
  });
});
