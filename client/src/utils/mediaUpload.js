export function buildMultipartFormData(fields = {}) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });
  return formData;
}

export function appendOptionalFile(formData, fieldName, file) {
  if (file) {
    formData.append(fieldName, file);
  }
}

// Upload a File directly to Cloudinary using server-signed params
export async function uploadDirectToCloudinary(file) {
  if (!file) return null;
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    // Request signature from server
    const sigRes = await fetch('/api/cloudinary/sign', { method: 'POST', headers, body: JSON.stringify({}) });
    if (!sigRes.ok) {
      const body = await sigRes.json().catch(() => ({}));
      if (body.message?.includes('not configured') || sigRes.status === 501) {
        return null;
      }
      throw new Error(body.message || 'Failed to get upload signature');
    }

    const sig = await sigRes.json();
    const { signature, timestamp, api_key, cloud_name, upload_preset } = sig;

    const url = `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', api_key);
    fd.append('timestamp', timestamp);
    fd.append('signature', signature);
    if (upload_preset) fd.append('upload_preset', upload_preset);

    const res = await fetch(url, { method: 'POST', body: fd });
    if (!res.ok) {
      const text = await res.text();
      if (text.includes('not configured') || text.includes('Invalid') || text.includes('unauthorized')) {
        return null;
      }
      throw new Error('Cloudinary upload failed: ' + text);
    }

    const body = await res.json();
    return body.secure_url || body.url || null;
  } catch (error) {
    console.warn('Cloudinary direct upload unavailable, using server fallback for the file upload.', error);
    return null;
  }
}

export async function uploadFilesToCloudinary(files = []) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const uploaded = [];
  for (const file of files) {
    const url = await uploadDirectToCloudinary(file);
    if (url) uploaded.push(url);
  }
  return uploaded;
}
