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

const api = axios.create();

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && !config.headers?.Authorization) {
    const token = window.localStorage.getItem('token');
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const response = error.response;
    if (response) {
      if (response.status === 401 || response.status === 403) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('token');
          window.localStorage.removeItem('user');
          window.dispatchEvent(new Event('api-unauthorized'));
        }
      }
      error.message = response.data?.message || response.statusText || error.message;
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error, fallback = 'Request failed.') {
  return error?.response?.data?.message || error?.message || fallback;
}

export default api;
