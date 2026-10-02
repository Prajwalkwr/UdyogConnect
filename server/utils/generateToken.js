const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Local development and tests only. Production never uses a value from the source code,
// because anyone who knows it could sign an admin token.
const DEV_ONLY_SECRET = 'udyogconnect_dev_only_secret_do_not_use_in_production';

const isProductionEnv = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

// Server-only values a production host may already have when JWT_SECRET is missing.
// A key derived from one of them is stable across restarts and not guessable from the source code.
const SERVER_ONLY_SECRET_KEYS = [
  'MONGODB_URI',
  'PAYMENT_ENCRYPTION_KEY',
  'BREVO_API_KEY',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'CLOUDINARY_API_SECRET',
  'RESEND_API_KEY',
  'GMAIL_APP_PASSWORD',
];

let productionFallback = null;

function productionFallbackSecret() {
  if (productionFallback) return productionFallback;
  const sourceKey = SERVER_ONLY_SECRET_KEYS.find((key) => String(process.env[key] || '').trim());
  if (sourceKey) {
    productionFallback = crypto
      .createHash('sha256')
      .update(`udyogconnect-jwt:${sourceKey}:${String(process.env[sourceKey]).trim()}`)
      .digest('hex');
    console.warn(`WARNING: JWT_SECRET is not set; using a key derived from ${sourceKey}. Set a long random JWT_SECRET in the server environment.`);
  } else {
    // Secure but signs everyone out whenever the server restarts.
    productionFallback = crypto.randomBytes(48).toString('hex');
    console.warn('WARNING: JWT_SECRET is not set; using a temporary random key, so users are signed out on every restart. Set a long random JWT_SECRET in the server environment.');
  }
  return productionFallback;
}

function assertJwtSecretConfigured() {
  const secret = String(process.env.JWT_SECRET || '');
  if (!isProductionEnv()) return;
  if (!secret) productionFallbackSecret();
  else if (secret.length < 32) console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Use a long random value.');
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  return isProductionEnv() ? productionFallbackSecret() : DEV_ONLY_SECRET;
}

function resetProductionFallbackForTests() {
  productionFallback = null;
}

function generateToken(user) {
  const userId = String(user._id || user.id || user.userId);
  return jwt.sign(
    { userId, id: userId, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { generateToken, getJwtSecret, assertJwtSecretConfigured, resetProductionFallbackForTests };
