export function resolveCheckoutBusinessId(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const firstItem = items[0] || {};
  return firstItem.businessId || firstItem.sellerId || firstItem.vendorId || '';
}
