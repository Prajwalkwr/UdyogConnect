const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/generateToken');

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';
const PASSWORD_CHANGED_MESSAGE = 'Your password was changed. Please log in again.';

const PASSWORD_CHANGE_CACHE_MS = 60 * 1000;
const PASSWORD_CHANGE_CACHE_MAX = 5000;
const passwordChangeCache = new Map();

function forgetPasswordChange(userId) {
  passwordChangeCache.delete(String(userId));
}

async function getPasswordChangedAt(userId) {
  const key = String(userId);
  const cached = passwordChangeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.changedAt;

  const { User } = require('../db');
  const UserMDL = typeof User === 'function' ? User() : null;
  if (!UserMDL) return null;
  const user = await UserMDL.findById(key);
  const changedAt = user?.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : null;

  if (passwordChangeCache.size >= PASSWORD_CHANGE_CACHE_MAX) passwordChangeCache.clear();
  passwordChangeCache.set(key, { changedAt, expiresAt: Date.now() + PASSWORD_CHANGE_CACHE_MS });
  return changedAt;
}

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader && String(authHeader).split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE, code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid or expired session token.' });
  }

  const userId = decoded.userId || decoded.id;
  req.user = {
    ...decoded,
    userId,
    id: userId,
    role: decoded.role,
  };

  // Sessions issued before the latest password reset are no longer valid.
  let changedAt = null;
  try {
    changedAt = userId ? await getPasswordChangedAt(userId) : null;
  } catch (err) {
    console.warn('[auth] Password change check skipped:', err && err.message);
  }
  if (changedAt && decoded.iat && decoded.iat < Math.floor(changedAt / 1000)) {
    return res.status(401).json({ message: PASSWORD_CHANGED_MESSAGE, code: 'PASSWORD_CHANGED' });
  }
  return next();
};

module.exports = { authenticateToken, forgetPasswordChange, SESSION_EXPIRED_MESSAGE, PASSWORD_CHANGED_MESSAGE };
