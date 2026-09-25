const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function getSessionStore() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export function getSessionToken() {
  const store = getSessionStore();
  if (!store) return '';
  adoptSharedAuthIntoThisTab();
  return store.getItem(TOKEN_KEY) || '';
}

export function getSessionUser() {
  const store = getSessionStore();
  if (!store) return null;
  adoptSharedAuthIntoThisTab();
  try {
    const raw = store.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    store.removeItem(USER_KEY);
    return null;
  }
}

export function setSessionAuth(token, user) {
  const store = getSessionStore();
  if (!store) return;
  if (token) store.setItem(TOKEN_KEY, token);
  if (user) store.setItem(USER_KEY, JSON.stringify(user));
  clearSharedAuth();
}

export function updateSessionUser(user) {
  const store = getSessionStore();
  if (!store || !user) return;
  store.setItem(USER_KEY, JSON.stringify(user));
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(USER_KEY);
  }
}

export function clearSessionAuth() {
  const store = getSessionStore();
  if (store) {
    store.removeItem(TOKEN_KEY);
    store.removeItem(USER_KEY);
  }
  clearSharedAuth();
}

function clearSharedAuth() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

function adoptSharedAuthIntoThisTab() {
  if (typeof window === 'undefined') return;
  const store = window.sessionStorage;
  if (store.getItem(TOKEN_KEY)) {
    clearSharedAuth();
    return;
  }
  const sharedToken = window.localStorage.getItem(TOKEN_KEY);
  const sharedUser = window.localStorage.getItem(USER_KEY);
  if (!sharedToken && !sharedUser) return;
  if (sharedToken) store.setItem(TOKEN_KEY, sharedToken);
  if (sharedUser) store.setItem(USER_KEY, sharedUser);
  clearSharedAuth();
}
