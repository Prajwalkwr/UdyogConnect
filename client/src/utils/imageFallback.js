const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
<rect width="400" height="300" fill="#efe7da"/>
<g fill="none" stroke="#b9a17a" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
<path d="M150 135h100l-12-30h-76z"/><path d="M160 135v55h80v-55"/><path d="M188 190v-30h24v30"/>
</g>
</svg>`;

export const IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/** Swap a broken <img> for a neutral placeholder so missing photos never show a broken icon or alt text. */
export function handleImageError(event) {
  const img = event && event.target;
  if (!img || img.tagName !== 'IMG') return false;
  if (img.getAttribute('src') === IMAGE_PLACEHOLDER) return false;
  if (img.dataset) img.dataset.failedSrc = img.getAttribute('src') || '';
  img.removeAttribute('srcset');
  img.setAttribute('src', IMAGE_PLACEHOLDER);
  if (img.classList) img.classList.add('uc-img-fallback');
  return true;
}

/** Image errors do not bubble, so listen in the capture phase once for the whole app. */
export function installImageFallback(target = typeof window !== 'undefined' ? window : null) {
  if (!target) return;
  target.addEventListener('error', handleImageError, true);
}
