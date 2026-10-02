/**
 * Detects a file's real type from its first bytes, ignoring the name and the browser-supplied MIME type,
 * which an attacker controls. Returns { mime, ext } or null when the content is not an allowed type.
 */
function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') return { mime: 'image/gif', ext: '.gif' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
  if (b.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  return null;
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const isImageBuffer = (buffer) => IMAGE_MIMES.has(detectFileType(buffer)?.mime);

module.exports = { detectFileType, isImageBuffer, IMAGE_MIMES };
