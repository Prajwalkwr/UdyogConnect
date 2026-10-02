import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getJwtSecret, assertJwtSecretConfigured, resetProductionFallbackForTests } = require('../server/utils/generateToken');
const { stripDangerousKeys, corsOrigin } = require('../server/middleware/security');
const { isBlockedDemoAccount } = require('../server/db');
const { detectFileType } = require('../server/utils/fileType');

const ENV_KEYS = ['NODE_ENV', 'RENDER', 'JWT_SECRET', 'MONGODB_URI', 'PAYMENT_ENCRYPTION_KEY', 'BREVO_API_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'CLOUDINARY_API_SECRET', 'RESEND_API_KEY', 'GMAIL_APP_PASSWORD', 'SEED_DEMO', 'ALLOW_DEMO_LOGIN', 'CORS_ORIGINS', 'CLIENT_URL', 'FRONTEND_URL'];
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  resetProductionFallbackForTests();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const asProduction = (extra = {}) => {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: 'production' }, extra);
};

describe('Production guards', () => {
  it('derives a stable private key from a server-only secret when JWT_SECRET is missing', () => {
    asProduction({ MONGODB_URI: 'mongodb+srv://user:private@cluster.example/db' });
    expect(() => assertJwtSecretConfigured()).not.toThrow();
    const secret = getJwtSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secret).not.toContain('private');
    resetProductionFallbackForTests();
    expect(getJwtSecret()).toBe(secret);
  });

  it('never signs production tokens with a value from the source code', () => {
    asProduction();
    expect(() => assertJwtSecretConfigured()).not.toThrow();
    const secret = getJwtSecret();
    expect(secret).toMatch(/^[0-9a-f]{96}$/);
    expect(secret).not.toBe('udyogconnect_secret_key_123');
    expect(secret).not.toMatch(/dev_only/);
    resetProductionFallbackForTests();
    expect(getJwtSecret()).not.toBe(secret);
  });

  it('uses the configured JWT secret in production', () => {
    asProduction({ JWT_SECRET: 'a'.repeat(48) });
    expect(() => assertJwtSecretConfigured()).not.toThrow();
    expect(getJwtSecret()).toBe('a'.repeat(48));
  });

  it('blocks the published demo accounts on the live site unless demo mode is enabled', () => {
    asProduction();
    expect(isBlockedDemoAccount('admin@udyog.np')).toBe(true);
    expect(isBlockedDemoAccount('ADMIN@UDYOG.NP')).toBe(true);
    expect(isBlockedDemoAccount('real.owner@gmail.com')).toBe(false);
    process.env.ALLOW_DEMO_LOGIN = 'true';
    expect(isBlockedDemoAccount('admin@udyog.np')).toBe(false);
  });

  it('allows demo accounts during local development', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.NODE_ENV = 'development';
    expect(isBlockedDemoAccount('admin@udyog.np')).toBe(false);
  });

  it('only allows configured browser origins in production', () => {
    asProduction({ CORS_ORIGINS: 'https://udyogconnect.example' });
    const check = (origin) => new Promise((resolve) => corsOrigin(origin, (_, allowed) => resolve(allowed)));
    return Promise.all([
      check('https://udyogconnect.example').then((allowed) => expect(allowed).toBe(true)),
      check('https://evil.example').then((allowed) => expect(allowed).toBe(false)),
      check('http://localhost:5174').then((allowed) => expect(allowed).toBe(false)),
      check(undefined).then((allowed) => expect(allowed).toBe(true)),
    ]);
  });
});

describe('Input sanitising', () => {
  it('strips MongoDB operators and prototype keys at any depth', () => {
    const input = JSON.parse('{"email":{"$ne":null},"nested":{"$where":"1","ok":1},"list":[{"$gt":""}],"__proto__":{"isAdmin":true}}');
    const clean = stripDangerousKeys(input);
    expect(clean.email).toEqual({});
    expect(clean.nested).toEqual({ ok: 1 });
    expect(clean.list).toEqual([{}]);
    expect({}.isAdmin).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
  });
});

describe('File type detection', () => {
  it('recognises real images and PDFs by their bytes, not their names', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const jpg = Buffer.from('ffd8ffe000104a46494600010100', 'hex');
    const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
    expect(detectFileType(png)?.mime).toBe('image/png');
    expect(detectFileType(jpg)?.mime).toBe('image/jpeg');
    expect(detectFileType(pdf)?.mime).toBe('application/pdf');
    expect(detectFileType(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00 executable file'))).toBeNull();
  });
});
