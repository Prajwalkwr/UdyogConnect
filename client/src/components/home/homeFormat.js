export const formatRupees = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function formatPriceRange(range) {
  if (!range || !(Number(range.min) > 0)) return '';
  if (Number(range.min) === Number(range.max)) return formatRupees(range.min);
  return `${formatRupees(range.min)} – ${formatRupees(range.max)}`;
}

export function formatCountdown(msLeft) {
  const total = Math.max(0, Math.floor((Number(msLeft) || 0) / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))} : ${pad(Math.floor((total % 3600) / 60))} : ${pad(total % 60)}`;
}

export function formatRelativeTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const businessImage = (business) =>
  business?.imageUrl || business?.coverUrl || business?.logoUrl || business?.logo || business?.image || '';
