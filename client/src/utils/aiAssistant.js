import { getApiUrl } from './api';
import { getSessionToken } from './sessionAuth';
import { visitorHeaders } from './activityTracking';

export const AI_OPEN_EVENT = 'udyog:open-assistant';
export const MAX_QUESTION_LENGTH = 500;
export const RADIUS_OPTIONS = [1, 3, 5, 10];
export const AI_MESSAGES = {
  loading: 'Finding businesses...',
  empty: 'No matching businesses found.',
  unavailable: 'AI service temporarily unavailable.',
  prompt: 'Try searching for a business, product, or service.',
  rateLimited: "You're sending requests too quickly. Please try again.",
  recommendationsUnavailable: 'AI recommendations are temporarily unavailable.',
};

const HISTORY_PREFIX = 'udyog_ai_chat:';
const HISTORY_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 30000;

function authHeaders(extra = {}) {
  const headers = { ...extra, ...visitorHeaders() };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** fetch with a timeout. Not the shared axios client: its POST handling clears the catalogue cache. */
async function request(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(getApiUrl(path), {
      method,
      headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Sends a question to the backend assistant. Identity comes from the session token only. */
export async function askAssistant({ message, location, radiusKm, signal }) {
  const body = { message: String(message || '').slice(0, MAX_QUESTION_LENGTH) };
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) body.location = { lat: location.lat, lng: location.lng };
  if (RADIUS_OPTIONS.includes(radiusKm)) body.radiusKm = radiusKm;
  try {
    const { ok, status, data } = await request('/api/ai/chat', { method: 'POST', body, signal });
    if (ok && data) return { ok: true, data };
    if (status === 429) return { ok: false, error: AI_MESSAGES.rateLimited };
    if (status === 400 && data?.message) return { ok: false, error: data.message };
    return { ok: false, error: AI_MESSAGES.unavailable };
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) return { ok: false, aborted: true };
    return { ok: false, error: AI_MESSAGES.unavailable };
  }
}

export async function fetchHomeSummary({ area, coords, signal } = {}) {
  const params = new URLSearchParams();
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    params.set('lat', String(coords.lat));
    params.set('lng', String(coords.lng));
  } else if (area) {
    params.set('area', area);
  }
  try {
    const { ok, data } = await request(`/api/ai/home-summary${params.toString() ? `?${params}` : ''}`, { signal });
    return ok && data ? data : { status: 'unavailable', summary: null };
  } catch {
    return { status: 'unavailable', summary: null };
  }
}

export async function resetRecommendationHistory() {
  try {
    const { ok, data } = await request('/api/activity/history', { method: 'DELETE' });
    return { ok, message: data?.message || (ok ? 'Your recommendation history was reset.' : 'Could not reset your recommendation history.') };
  } catch {
    return { ok: false, message: 'Could not reset your recommendation history.' };
  }
}

export function openAssistant(prompt = '') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT, { detail: { prompt } }));
}

/* Chat history lives only in this browser tab, separately for each account. */
const historyKey = (userId) => `${HISTORY_PREFIX}${userId || 'guest'}`;

export function loadChatHistory(userId) {
  if (typeof window === 'undefined') return [];
  try {
    const current = historyKey(userId);
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(HISTORY_PREFIX) && key !== current) window.sessionStorage.removeItem(key);
    }
    const parsed = JSON.parse(window.sessionStorage.getItem(current) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Only the text is kept: result cards are dropped so a restored chat never shows an old price or stock level. */
export function saveChatHistory(userId, messages) {
  if (typeof window === 'undefined') return;
  try {
    const textOnly = messages
      .filter((message) => message && !message.pending && message.text)
      .slice(-HISTORY_LIMIT)
      .map(({ role, text, question }) => ({ role, text, question, restored: true }));
    window.sessionStorage.setItem(historyKey(userId), JSON.stringify(textOnly));
  } catch {
    // Storage full or disabled: history is a convenience only.
  }
}

export function clearChatHistory(userId) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(historyKey(userId));
  } catch {
    // ignore
  }
}

export const formatNpr = (value) => `NPR ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
