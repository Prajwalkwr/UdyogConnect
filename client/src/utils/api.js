import axios from 'axios';

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
  timeout: 15000, // 15-second timeout for all API requests
});

api.interceptors.request.use((config) => {
  const headers = { ...(config.headers || {}) };
  if (typeof window !== 'undefined' && !headers.Authorization) {
    const token = window.localStorage.getItem('token');
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
  (response) => response,
  async (error) => {
    const config = error.config;
    const response = error.response;
    
    // Auth handling
    if (response && (response.status === 401 || response.status === 403)) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('token');
        window.localStorage.removeItem('user');
        window.dispatchEvent(new Event('api-unauthorized'));
      }
    }

    // Retry logic for temporary server errors (502, 503, 504) or network timeouts
    if (config && (!response || (response.status >= 500 && response.status <= 504))) {
      config.__retryCount = config.__retryCount || 0;
      
      if (config.__retryCount < 2) { // Max 2 retries (3 total attempts)
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
        error.message = response.data?.message || response.statusText || error.message;
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
  return error?.message || error?.response?.data?.message || fallback;
}

export default api;

