const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/generateToken');

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader && String(authHeader).split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = decoded.userId || decoded.id;
    req.user = {
      ...decoded,
      userId,
      id: userId,
      role: decoded.role,
    };
    return next();
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE, code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid or expired session token.' });
  }
};

module.exports = { authenticateToken, SESSION_EXPIRED_MESSAGE };
