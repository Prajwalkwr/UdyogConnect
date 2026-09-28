import api from './api';

export function formatRs(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatBillDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Kathmandu',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  });
}

export const PAYMENT_METHOD_LABELS = {
  COD: 'Cash on Delivery',
  QR: 'QR Payment',
  Card: 'Card (Stripe)',
  Wallet: 'Wallet',
  eSewa: 'eSewa',
};

export function paymentStatusMeta(status) {
  const key = String(status || 'pending').toLowerCase();
  if (key === 'paid') return { label: 'PAID', color: '#059669', bg: '#D1FAE5' };
  if (key === 'refunded') return { label: 'REFUNDED', color: '#DC2626', bg: '#FEE2E2' };
  return { label: 'PENDING', color: '#D97706', bg: '#FEF3C7' };
}

export function billEmailMeta(status) {
  if (status === 'sent') return { label: '✓ Bill emailed', short: '✓ Sent', color: '#059669' };
  if (status === 'sending') return { label: 'Sending bill…', short: 'Sending…', color: '#2563EB' };
  if (status === 'failed') return { label: '⚠ Bill email failed', short: '⚠ Failed', color: '#DC2626' };
  return { label: '⚠ Bill not emailed', short: '⚠ Not Sent', color: '#D97706' };
}

/** Axios returns error bodies as Blobs for blob requests; surface the server's JSON message. */
async function readBlobError(error, fallback) {
  const data = error?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch (_) { /* not JSON */ }
  }
  return error?.response?.data?.message || error?.message || fallback;
}

export async function fetchBill(orderId) {
  const response = await api.get(`/api/orders/${encodeURIComponent(orderId)}/bill`);
  return response.data.bill;
}

async function fetchBillPdf(orderId, disposition = 'attachment') {
  try {
    const response = await api.get(`/api/orders/${encodeURIComponent(orderId)}/bill/download`, {
      params: disposition === 'inline' ? { disposition: 'inline' } : undefined,
      responseType: 'blob',
      timeout: 30000,
    });
    const header = response.headers?.['content-disposition'] || '';
    const filename = /filename="([^"]+)"/.exec(header)?.[1] || 'UdyogConnect-Bill.pdf';
    return { blob: new Blob([response.data], { type: 'application/pdf' }), filename };
  } catch (error) {
    throw new Error(await readBlobError(error, 'Could not load the bill.'));
  }
}

export async function downloadBillPdf(orderId) {
  const { blob, filename } = await fetchBillPdf(orderId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return filename;
}

/** Opens the PDF in a new tab. The tab is opened synchronously so popup blockers allow it. */
export async function openBillPdf(orderId) {
  const tab = window.open('', '_blank');
  try {
    const { blob } = await fetchBillPdf(orderId, 'inline');
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60000);
  } catch (error) {
    if (tab) tab.close();
    throw error;
  }
}

export async function sendBillEmail(orderId) {
  const response = await api.post(`/api/orders/${encodeURIComponent(orderId)}/send-bill`);
  return response.data;
}

export async function resendBillEmail(orderId) {
  const response = await api.post(`/api/orders/${encodeURIComponent(orderId)}/resend-bill`);
  return response.data;
}

export function notifyOrdersUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('orders-updated'));
}
