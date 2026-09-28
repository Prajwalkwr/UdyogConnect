import { getApiUrl } from './api';
import { getSessionToken } from './sessionAuth';

const VISITOR_KEY = 'udyog_visitor_id';

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Anonymous, per-browser id so guests also get "people also viewed" and trending signals. */
export function getVisitorId() {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

export function visitorHeaders() {
  const id = getVisitorId();
  return id ? { 'X-Visitor-Id': id } : {};
}

/**
 * Records a business or product view. Uses fetch (not the axios instance) because axios POSTs
 * clear the shared GET cache, and a view must never slow down or break the page.
 */
export function trackView({ businessId, productId } = {}) {
  if (typeof window === 'undefined' || typeof fetch !== 'function' || (!businessId && !productId)) return;
  const headers = { 'Content-Type': 'application/json', ...visitorHeaders() };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    fetch(getApiUrl('/api/activity/view'), {
      method: 'POST',
      headers,
      body: JSON.stringify(productId ? { productId: String(productId) } : { businessId: String(businessId) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Tracking is best-effort.
  }
}
