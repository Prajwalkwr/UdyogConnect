import { beforeEach, describe, expect, it } from 'vitest';
import { readStoredJson, removeStoredValue } from './storage';

describe('storage helpers', () => {
  beforeEach(() => {
    const storage = new Map();
    global.window = {
      localStorage: {
        getItem: (key) => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key),
        clear: () => storage.clear(),
      },
    };
  });

  it('returns a fallback value and clears malformed JSON', () => {
    window.localStorage.setItem('broken-user', '{not valid json');

    const value = readStoredJson('broken-user', { name: 'guest' });

    expect(value).toEqual({ name: 'guest' });
    expect(window.localStorage.getItem('broken-user')).toBeNull();
  });

  it('removes an item safely even when storage is unavailable', () => {
    const result = removeStoredValue('missing-key');
    expect(result).toBe(true);
  });
});
