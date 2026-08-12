export function resolveCheckoutBusinessId(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';

  for (const item of items) {
    const businessId = item?.businessId || item?.sellerId || item?.vendorId || item?.business?.id || item?.business?.businessId || '';
    if (businessId) return String(businessId);
  }

  return '';
}
