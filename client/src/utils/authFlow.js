export function getPostRegistrationMode() {
  return 'login';
}

export function getDashboardLabel(role, lang = 'en') {
  const normalizedRole = String(role || 'customer').toLowerCase();
  const labels = {
    customer: {
      en: 'User Dashboard',
      ne: 'प्रयोगकर्ता ड्यासबोर्ड',
    },
    seller: {
      en: 'Seller Dashboard',
      ne: 'बेचेउँता ड्यासबोर्ड',
    },
    admin: {
      en: 'Admin Dashboard',
      ne: 'एडमिन ड्यासबोर्ड',
    },
  };

  return labels[normalizedRole]?.[lang] || labels.customer[lang] || 'User Dashboard';
}

export function isValidNepalPhone(phone) {
  const value = String(phone || '').trim();
  return /^9\d{8,10}$/.test(value);
}

export function isCouponExpired(expiryDate) {
  if (!expiryDate) return true;
  const current = new Date();
  const endOfDay = new Date(`${expiryDate}T23:59:59`);
  return Number(endOfDay) < Number(current);
}

export function normalizeUser(user) {
  if (!user) return null;

  const resolvedId = user._id || user.id || user.userId || null;
  const resolvedName = user.name || user.fullName || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || (typeof user.email === 'string' ? user.email.split('@')[0] : 'User');

  return {
    ...user,
    id: resolvedId,
    _id: resolvedId,
    name: resolvedName,
  };
}
