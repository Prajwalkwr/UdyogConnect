import { describe, expect, it } from 'vitest';
import { IMAGE_PLACEHOLDER, handleImageError, installImageFallback } from './imageFallback';

const fakeImage = (src, tagName = 'IMG') => {
  const attrs = { src, srcset: `${src} 2x` };
  const classes = new Set();
  return {
    tagName,
    dataset: {},
    classList: { add: (name) => classes.add(name), has: (name) => classes.has(name) },
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => { attrs[name] = value; },
    removeAttribute: (name) => { delete attrs[name]; },
    attrs,
  };
};

describe('image fallback', () => {
  it('replaces a broken image with the placeholder and remembers the original', () => {
    const img = fakeImage('/uploads/missing.jpg');
    expect(handleImageError({ target: img })).toBe(true);
    expect(img.attrs.src).toBe(IMAGE_PLACEHOLDER);
    expect(img.attrs.srcset).toBeUndefined();
    expect(img.dataset.failedSrc).toBe('/uploads/missing.jpg');
    expect(img.classList.has('uc-img-fallback')).toBe(true);
  });

  it('never loops when the placeholder itself is shown', () => {
    const img = fakeImage(IMAGE_PLACEHOLDER);
    expect(handleImageError({ target: img })).toBe(false);
  });

  it('ignores errors from scripts and other elements', () => {
    const script = fakeImage('/app.js', 'SCRIPT');
    expect(handleImageError({ target: script })).toBe(false);
    expect(script.attrs.src).toBe('/app.js');
  });

  it('listens in the capture phase because image errors do not bubble', () => {
    const calls = [];
    installImageFallback({ addEventListener: (...args) => calls.push(args) });
    expect(calls).toEqual([['error', handleImageError, true]]);
  });
});
