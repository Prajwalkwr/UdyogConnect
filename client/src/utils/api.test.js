import { afterEach, describe, expect, it, vi } from 'vitest';
import api from './api';

const failingAdapter = (calls, response) => async (config) => {
  calls.push(String(config.method).toLowerCase());
  const error = new Error('Network Error');
  error.config = config;
  error.isAxiosError = true;
  if (response) error.response = { ...response, config };
  throw error;
};

describe('api client error handling', () => {
  const originalAdapter = api.defaults.adapter;

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    vi.useRealTimers();
  });

  it('never resends a POST that failed, so an order or payment is not submitted twice', async () => {
    const calls = [];
    api.defaults.adapter = failingAdapter(calls);
    await expect(api.post('/api/checkout', { items: [] })).rejects.toBeTruthy();
    expect(calls).toEqual(['post']);
  });

  it('retries a failed read once', async () => {
    vi.useFakeTimers();
    const calls = [];
    api.defaults.adapter = failingAdapter(calls);
    const pending = api.get('/api/orders').catch((error) => error);
    await vi.advanceTimersByTimeAsync(1500);
    const error = await pending;
    expect(calls).toEqual(['get', 'get']);
    expect(error.message).toMatch(/network|offline/i);
  });

  it('shows the server message instead of internal details', async () => {
    const calls = [];
    api.defaults.adapter = failingAdapter(calls, { status: 400, data: { message: 'Enter a valid coupon code.' } });
    await expect(api.get('/api/coupons/validate')).rejects.toMatchObject({ message: 'Enter a valid coupon code.' });
  });

  it('gives uploads a longer timeout for slow connections', async () => {
    let seenTimeout = 0;
    api.defaults.adapter = async (config) => {
      seenTimeout = config.timeout;
      return { data: {}, status: 201, statusText: 'Created', headers: {}, config };
    };
    await api.post('/api/upload/image-base64', { dataUrl: 'data:image/png;base64,AA==' });
    expect(seenTimeout).toBeGreaterThanOrEqual(120000);
  });
});
