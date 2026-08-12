export function getPostRegistrationMode() {
  return 'login';
}

export function normalizeUser(user) {
  if (!user) return null;

  const resolvedId = user._id || user.id || user.userId || null;
  return {
    ...user,
    id: resolvedId,
    _id: resolvedId,
  };
}
