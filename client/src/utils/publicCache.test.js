import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPublicCache, writePublicCache } from './publicCache';

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
};

describe('public cache', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the last saved value', () => {
    writePublicCache('catalog', { businesses: [{ name: 'Shop' }] });
    expect(readPublicCache('catalog')).toEqual({ businesses: [{ name: 'Shop' }] });
  });

  it('ignores entries older than the allowed age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    writePublicCache('catalog', [1]);
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    expect(readPublicCache('catalog')).toBeNull();
  });

  it('skips values that are too large and survives corrupt or blocked storage', () => {
    writePublicCache('huge', 'x'.repeat(600000));
    expect(readPublicCache('huge')).toBeNull();

    localStorage.setItem('uc-public-cache:broken', '{not json');
    expect(readPublicCache('broken')).toBeNull();

    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(() => writePublicCache('catalog', [1])).not.toThrow();
    expect(readPublicCache('catalog')).toBeNull();
  });
});
