export function readStoredJson(key, fallback = null) {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    console.warn(`Invalid storage payload for ${key}. Clearing it.`, error);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore storage access issues
    }
    return fallback;
  }
}

export function removeStoredValue(key) {
  if (typeof window === 'undefined') return true;

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
