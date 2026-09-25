const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'udyogconnect_secret_key_123';
}

function generateToken(user) {
  const userId = String(user._id || user.id || user.userId);
  return jwt.sign(
    { userId, id: userId, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { generateToken, getJwtSecret };
