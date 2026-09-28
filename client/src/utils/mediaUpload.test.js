import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  default: { post: vi.fn().mockRejectedValue(new Error('Network error')) },
}));

import { buildMultipartFormData, appendOptionalFile, uploadFilesToCloudinary } from './mediaUpload';

describe('media upload helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds form data from text fields and appends image files', () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const formData = buildMultipartFormData({ name: 'Shop', description: 'Crafts', category: 'Gift Shop' });
    appendOptionalFile(formData, 'logo', file);

    expect(formData.get('name')).toBe('Shop');
    expect(formData.get('description')).toBe('Crafts');
    expect(formData.get('category')).toBe('Gift Shop');
    expect(formData.get('logo')?.name).toBe('logo.png');
  });

  it('embeds the image inline when Cloudinary and server uploads are unavailable', async () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 501, json: async () => ({ message: 'Cloudinary not configured.' }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('FileReader', class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,bG9nbw==';
        this.onload();
      }
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const urls = await uploadFilesToCloudinary([file]);

    expect(urls).toEqual(['data:image/png;base64,bG9nbw==']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
