const { createWindowLimiter } = require('../utils/windowLimiter');

const isProduction = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

/** Baseline browser security headers for every response. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (isProduction()) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/** User uploads must never run as a page, even if a file slips past the image checks. */
function uploadHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Removes MongoDB operator keys ($gt, $ne, $where…) and prototype-pollution keys from request input,
 * so a JSON body like { "email": { "$ne": null } } can never reach a database query as an operator.
 */
function stripDangerousKeys(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = stripDangerousKeys(value[i], depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || FORBIDDEN_KEYS.has(key)) {
      delete value[key];
    } else {
      value[key] = stripDangerousKeys(value[key], depth + 1);
    }
  }
  return value;
}

function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) stripDangerousKeys(req.body);
  next();
}

const rateLimitsEnabled = () => {
  const setting = String(process.env.RATE_LIMITS || '').toLowerCase();
  if (setting === 'off') return false;
  if (setting === 'on') return true;
  return process.env.NODE_ENV !== 'test';
};

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/**
 * Fixed-window rate limit middleware.
 * `key` picks what is counted (IP by default); return '' to skip counting a request.
 */
function rateLimit({ windowMs, max, key = clientIp, message = 'Too many requests. Please wait a moment and try again.' }) {
  const limiter = createWindowLimiter({ windowMs, max });
  return (req, res, next) => {
    if (!rateLimitsEnabled()) return next();
    const id = key(req);
    if (!id) return next();
    const { allowed, retryAfterSec } = limiter.hit(String(id));
    if (allowed) return next();
    res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
    return res.status(429).json({ message, code: 'RATE_LIMITED', retryAfterSec });
  };
}

const byUserOrIp = (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${clientIp(req)}`);

// The project's own deployed websites (see render.yaml); always allowed once any origin list is configured.
const FIRST_PARTY_ORIGINS = ['https://udyog-connect-lyart.vercel.app', 'https://udyogconnect-client.onrender.com'];

/**
 * Allowed browser origins from CORS_ORIGINS (comma separated), falling back to CLIENT_URL / FRONTEND_URL.
 * Production always allows the first-party sites; an empty list (any origin) is for local development only.
 */
function allowedOrigins() {
  const raw = process.env.CORS_ORIGINS || [process.env.CLIENT_URL, process.env.FRONTEND_URL].filter(Boolean).join(',');
  const configured = raw.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
  if (configured.length || isProduction()) return [...new Set([...configured, ...FIRST_PARTY_ORIGINS])];
  return [];
}

/** CORS origin check: same-origin and server-to-server requests have no Origin header and are always allowed. */
function corsOrigin(origin, callback) {
  const allowed = allowedOrigins();
  if (!origin || !allowed.length) return callback(null, true);
  if (allowed.includes(origin)) return callback(null, true);
  if (!isProduction() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
  return callback(null, false);
}

module.exports = {
  securityHeaders,
  uploadHeaders,
  sanitizeRequest,
  stripDangerousKeys,
  rateLimit,
  rateLimitsEnabled,
  byUserOrIp,
  clientIp,
  corsOrigin,
  allowedOrigins,
  isProduction,
};
