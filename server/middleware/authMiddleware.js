const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/generateToken');

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';
const PASSWORD_CHANGED_MESSAGE = 'Your password was changed. Please log in again.';
const ACCOUNT_SUSPENDED_MESSAGE = 'This account has been suspended. Please contact support.';
const ACCOUNT_MISSING_MESSAGE = 'This account no longer exists. Please log in again.';

const USER_STATE_CACHE_MS = 60 * 1000;
const USER_STATE_CACHE_MAX = 5000;
const userStateCache = new Map();

/** Drops the cached account state so the next request re-reads it (after password change, suspension, deletion or role change). */
function forgetPasswordChange(userId) {
  userStateCache.delete(String(userId));
}

/**
 * Returns { exists, changedAt, status, role } for a user, cached briefly so every request
 * doesn't hit the database. Returns null when the lookup itself fails.
 */
async function getUserState(userId) {
  const key = String(userId);
  const cached = userStateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const { User, isBlockedDemoAccount } = require('../db');
  const UserMDL = typeof User === 'function' ? User() : null;
  if (!UserMDL) return null;
  const user = await UserMDL.findById(key);
  const state = user
    ? {
        exists: true,
        changedAt: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : null,
        status: typeof isBlockedDemoAccount === 'function' && isBlockedDemoAccount(user.email) ? 'suspended' : (user.status || 'active'),
        role: user.role || null,
      }
    : { exists: false, changedAt: null, status: null, role: null };

  if (userStateCache.size >= USER_STATE_CACHE_MAX) userStateCache.clear();
  userStateCache.set(key, { state, expiresAt: Date.now() + USER_STATE_CACHE_MS });
  return state;
}

/**
 * Checks a verified token against the current account. Returns { user } when the session is
 * still valid, or { status, message, code } when it must be rejected.
 */
async function resolveSession(decoded) {
  const userId = decoded && (decoded.userId || decoded.id);
  if (!userId) return { status: 401, message: 'Invalid or expired session token.', code: 'INVALID_TOKEN' };

  let state = null;
  try {
    state = await getUserState(userId);
  } catch (err) {
    console.warn('[auth] Account check skipped:', err && err.message);
  }

  if (state) {
    if (!state.exists) return { status: 401, message: ACCOUNT_MISSING_MESSAGE, code: 'ACCOUNT_MISSING' };
    if (state.status === 'suspended') return { status: 403, message: ACCOUNT_SUSPENDED_MESSAGE, code: 'ACCOUNT_SUSPENDED' };
    if (state.changedAt && decoded.iat && decoded.iat < Math.floor(state.changedAt / 1000)) {
      return { status: 401, message: PASSWORD_CHANGED_MESSAGE, code: 'PASSWORD_CHANGED' };
    }
  }

  // The stored role wins over the token's claim, so a demoted account loses access immediately.
  const role = (state && state.role) || decoded.role;
  return { user: { ...decoded, userId, id: userId, role } };
}

const readBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const [scheme, token] = String(authHeader || '').split(' ');
  return scheme && /^bearer$/i.test(scheme) && token ? token : null;
};

const authenticateToken = async (req, res, next) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE, code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid or expired session token.' });
  }

  const session = await resolveSession(decoded);
  if (!session.user) {
    return res.status(session.status).json({ message: session.message, code: session.code });
  }
  req.user = session.user;
  return next();
};

/** Same checks as authenticateToken, but requests without a valid session continue as guests (req.user = null). */
const optionalAuthenticate = async (req, res, next) => {
  req.user = null;
  const token = readBearerToken(req);
  if (!token) return next();

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch (_) {
    return next();
  }
  const session = await resolveSession(decoded);
  if (session.user) req.user = session.user;
  return next();
};

module.exports = {
  authenticateToken,
  optionalAuthenticate,
  resolveSession,
  forgetPasswordChange,
  SESSION_EXPIRED_MESSAGE,
  PASSWORD_CHANGED_MESSAGE,
  ACCOUNT_SUSPENDED_MESSAGE,
};
