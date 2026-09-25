import axios from 'axios';
import { clearSessionAuth, getSessionToken } from './sessionAuth';

export function getApiBaseUrl() {
  const configured = import.meta.env?.VITE_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return '';
  }

  return '';
}

export function getApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

const api = axios.create({
  baseURL: getApiBaseUrl() || '', // Use the Vite proxy locally; deployments should provide VITE_API_URL.
  timeout: 20000,
});

const GET_CACHE_MS = 20000;
const cacheableGets = new Set(['/api/businesses', '/api/products', '/api/services', '/api/categories', '/api/reviews']);
const getCache = new Map();

function cacheKey(url) {
  return String(url || '').split('?')[0];
}

export function invalidateApiCache(prefix = '') {
  if (!prefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.startsWith(prefix)) getCache.delete(key);
  }
}

api.interceptors.request.use((config) => {
  const headers = { ...(config.headers || {}) };
  if (typeof window !== 'undefined' && !headers.Authorization) {
    const token = getSessionToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }
  config.headers = headers;
  return config;
});

// Implement controlled retry for 5xx network/server errors
api.interceptors.response.use(
  (response) => {
    const method = String(response.config?.method || 'get').toLowerCase();
    const url = response.config?.url || '';
    if (method === 'get' && cacheableGets.has(cacheKey(url))) {
      getCache.set(url, { at: Date.now(), data: response.data });
    } else if (method !== 'get') {
      invalidateApiCache();
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    const response = error.response;
    
    // Auth handling
    if (response && response.status === 401) {
      if (typeof window !== 'undefined') {
        clearSessionAuth();
        const message = response.data?.message || 'Your session has expired. Please log in again.';
        window.dispatchEvent(new CustomEvent('api-unauthorized', { detail: { message } }));
      }
    }

    // Retry logic for temporary server errors (502, 503, 504) or network timeouts
    if (config && (!response || (response.status >= 500 && response.status <= 504))) {
      config.__retryCount = config.__retryCount || 0;
      
      if (config.__retryCount < 1) {
        config.__retryCount += 1;
        // Exponential backoff
        const backoffDelay = new Promise(resolve => setTimeout(resolve, config.__retryCount * 1000));
        await backoffDelay;
        return api(config);
      }
    }

    // Error translation
    if (response) {
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        error.message = 'Server is temporarily unavailable. Please try again.';
      } else {
        let serverMessage = response.data?.message;
        if (!serverMessage && typeof response.data === 'string') {
          try {
            serverMessage = JSON.parse(response.data)?.message;
          } catch (_) {
            serverMessage = response.data;
          }
        }
        error.message = serverMessage || response.statusText || error.message;
      }
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      error.message = 'Request timed out. Please check your connection and try again.';
    } else if (!response) {
      error.message = 'Network error. Please check your internet connection.';
    }

    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error, fallback = 'Request failed.') {
  const data = error?.response?.data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (parsed?.message) return parsed.message;
    } catch (_) {
      if (data.trim()) return data;
    }
  }
  return data?.message || error?.message || fallback;
}

const rawGet = api.get.bind(api);
api.get = (url, config = {}) => {
  const path = cacheKey(url);
  const key = String(url);
  if (!cacheableGets.has(path) || config.cacheBust) return rawGet(url, config);

  const hit = getCache.get(key);
  if (hit?.data && Date.now() - hit.at < GET_CACHE_MS) {
    return Promise.resolve({ data: hit.data, status: 200, statusText: 'OK', headers: {}, config });
  }
  if (hit?.pending) return hit.pending;

  const pending = rawGet(url, config)
    .then((response) => {
      getCache.set(key, { at: Date.now(), data: response.data });
      return response;
    })
    .catch((error) => {
      const current = getCache.get(key);
      if (current?.pending) getCache.delete(key);
      throw error;
    });

  getCache.set(key, { pending, at: 0 });
  return pending;
};

export default api;

