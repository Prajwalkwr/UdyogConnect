// Last good copy of PUBLIC data (catalogue, guest home feed) so pages render instantly
// and survive a slow or sleeping backend. Never store personal or signed-in data here.
const PREFIX = 'uc-public-cache:';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_CHARS = 500000;

const storage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function readPublicCache(key, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const store = storage();
  if (!store || !key) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.savedAt !== 'number' || Date.now() - entry.savedAt > maxAgeMs) return null;
    return entry.value ?? null;
  } catch {
    return null;
  }
}

export function writePublicCache(key, value) {
  const store = storage();
  if (!store || !key) return;
  try {
    const raw = JSON.stringify({ savedAt: Date.now(), value });
    if (raw.length > MAX_ENTRY_CHARS) return;
    store.setItem(PREFIX + key, raw);
  } catch {
    /* storage full or blocked: caching is optional */
  }
}
