import api from './api';

export const DEFAULT_HERO_IMAGE =
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=2000&q=80';

export const HERO_IMAGE_EVENT = 'hero-image-updated';
const CACHE_KEY = 'uc-hero-image';

export function cachedHeroImage() {
  try {
    return localStorage.getItem(CACHE_KEY) || DEFAULT_HERO_IMAGE;
  } catch {
    return DEFAULT_HERO_IMAGE;
  }
}

function rememberHeroImage(url) {
  try {
    if (url) localStorage.setItem(CACHE_KEY, url);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function fetchHeroImage() {
  const response = await api.get('/api/site/hero');
  const url = response.data?.heroImage || '';
  rememberHeroImage(url);
  return url || DEFAULT_HERO_IMAGE;
}

export async function saveHeroImage(heroImage) {
  const response = await api.put('/api/admin/hero-image', { heroImage });
  const url = response.data?.heroImage || '';
  rememberHeroImage(url);
  window.dispatchEvent(new CustomEvent(HERO_IMAGE_EVENT, { detail: url || DEFAULT_HERO_IMAGE }));
  return url || DEFAULT_HERO_IMAGE;
}

export const heroBackground = (url) => `url(${JSON.stringify(url || DEFAULT_HERO_IMAGE)})`;
