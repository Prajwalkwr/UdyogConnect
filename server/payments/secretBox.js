const crypto = require('crypto');

const VERSION = 'v1';
let warnedAboutFallback = false;

/**
 * 32-byte key for merchant secrets. PAYMENT_ENCRYPTION_KEY (64 hex chars or base64) is preferred;
 * otherwise it is derived from JWT_SECRET so development works without extra setup.
 */
function resolveKey() {
  const configured = String(process.env.PAYMENT_ENCRYPTION_KEY || '').trim();
  if (configured) {
    const raw = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64');
    if (raw.length === 32) return raw;
    return crypto.createHash('sha256').update(configured).digest();
  }
  const fallbackSource = process.env.JWT_SECRET || 'udyogconnect-dev-payment-key';
  if (!warnedAboutFallback && process.env.NODE_ENV === 'production') {
    warnedAboutFallback = true;
    console.warn('[payments] PAYMENT_ENCRYPTION_KEY is not set; deriving the merchant secret key from JWT_SECRET.');
  }
  return crypto.createHash('sha256').update(`payment-secrets:${fallbackSource}`).digest();
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', resolveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptSecret(payload) {
  const [version, iv, tag, data] = String(payload || '').split(':');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unsupported encrypted secret format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', resolveKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
