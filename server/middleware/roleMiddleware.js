const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: Insufficient permissions.' });
  }
  return next();
};

module.exports = { requireRole };
