import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMultipartFormData, appendOptionalFile, uploadFilesToCloudinary } from './mediaUpload';

describe('media upload helpers', () => {
  it('builds form data from text fields and appends image files', () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const formData = buildMultipartFormData({ name: 'Shop', description: 'Crafts', category: 'Gift Shop' });
    appendOptionalFile(formData, 'logo', file);

    expect(formData.get('name')).toBe('Shop');
    expect(formData.get('description')).toBe('Crafts');
    expect(formData.get('category')).toBe('Gift Shop');
    expect(formData.get('logo')?.name).toBe('logo.png');
  });

  it('falls back gracefully when Cloudinary is unavailable', async () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 501, json: async () => ({ message: 'Cloudinary not configured.' }) });

    global.fetch = fetchMock;

    const urls = await uploadFilesToCloudinary([file]);

    expect(urls).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
