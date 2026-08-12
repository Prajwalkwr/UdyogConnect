function normalizePaymentMethods(paymentMethods) {
  if (Array.isArray(paymentMethods)) {
    return paymentMethods.filter(Boolean).map((method) => String(method).trim()).filter(Boolean);
  }

  if (paymentMethods && typeof paymentMethods === 'object') {
    return Object.entries(paymentMethods)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => String(name));
  }

  return [];
}

export function normalizeAdminSettings(values = {}) {
  return {
    taxRate: values.taxRate ?? 13,
    deliveryFee: values.deliveryFee ?? 70,
    commissionRate: values.commissionRate ?? 5,
    paymentMethods: normalizePaymentMethods(values.paymentMethods),
  };
}

export function buildAdminSettingsPayload(values = {}) {
  const normalized = normalizeAdminSettings(values);

  return {
    taxRate: normalized.taxRate !== undefined ? Number(normalized.taxRate) : undefined,
    deliveryFee: normalized.deliveryFee !== undefined ? Number(normalized.deliveryFee) : undefined,
    commissionRate: normalized.commissionRate !== undefined ? Number(normalized.commissionRate) : undefined,
    paymentMethods: normalized.paymentMethods,
  };
}

export function getBusinessStatusMeta(status = '') {
  switch (status) {
    case 'verified':
      return { label: 'Verified', tone: 'cyan' };
    case 'suspended':
      return { label: 'Suspended', tone: 'rose' };
    case 'pending':
    default:
      return { label: 'Pending', tone: 'amber' };
  }
}
