import api from './api';
import { getSessionToken } from './sessionAuth';

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

// Upload a File directly to Cloudinary using server-signed params
export async function uploadDirectToCloudinary(file) {
  if (!file) return null;
  const token = getSessionToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const sigRes = await fetch('/api/cloudinary/sign', {
      method: 'POST',
      headers,
      body: JSON.stringify({ folder: 'udyogconnect' }),
    });
    if (!sigRes.ok) return null;

    const sig = await sigRes.json();
    const { signature, timestamp, api_key, cloud_name, folder } = sig;
    if (!signature || !api_key || !cloud_name) return null;

    const url = `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', api_key);
    fd.append('timestamp', String(timestamp));
    fd.append('folder', folder || 'udyogconnect');
    fd.append('signature', signature);

    const res = await fetch(url, { method: 'POST', body: fd });
    if (!res.ok) return null;

    const body = await res.json();
    return body.secure_url || body.url || null;
  } catch (error) {
    console.warn('Cloudinary direct upload unavailable, using server fallback.', error);
    return null;
  }
}

/** Multipart upload via /api/upload/image */
export async function uploadImageViaServer(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append('image', file, file.name || 'photo.jpg');

  const response = await api.post('/api/upload/image', fd, { timeout: 120000 });
  return response.data?.url || response.data?.imageUrl || null;
}

/** JSON/base64 upload — reliable when multipart fails */
export async function uploadImageAsBase64(file) {
  if (!file) return null;
  const dataUrl = await readFileAsDataUrl(file);
  const response = await api.post('/api/upload/image-base64', {
    dataUrl,
    fileName: file.name || 'photo.jpg',
    mimeType: file.type || 'image/jpeg',
  }, { timeout: 120000 });
  return response.data?.url || response.data?.imageUrl || null;
}

/**
 * Resolve a public image URL for a File.
 * Cloudinary direct → multipart server → base64 server → inline data URL (always works).
 */
export async function resolveImageUploadUrl(file) {
  if (!file) return null;

  try {
    const direct = await uploadDirectToCloudinary(file);
    if (direct) return direct;
  } catch {
    /* fall through */
  }

  try {
    const viaMultipart = await uploadImageViaServer(file);
    if (viaMultipart) return viaMultipart;
  } catch (err) {
    console.warn('Multipart image upload failed, trying base64 fallback.', err?.message || err);
  }

  try {
    const viaBase64 = await uploadImageAsBase64(file);
    if (viaBase64) return viaBase64;
  } catch (err) {
    console.warn('Server base64 upload failed, embedding image inline.', err?.message || err);
  }

  // Last resort: store as data URL on the service itself (no extra upload route needed).
  return readFileAsDataUrl(file);
}

export async function uploadFilesToCloudinary(files = []) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const uploaded = [];
  for (const file of files) {
    const url = await resolveImageUploadUrl(file);
    if (url) uploaded.push(url);
  }
  return uploaded;
}
