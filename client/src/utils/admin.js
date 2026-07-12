export function buildAdminSettingsPayload(values = {}) {
  return {
    taxRate: values.taxRate !== undefined ? Number(values.taxRate) : undefined,
    deliveryFee: values.deliveryFee !== undefined ? Number(values.deliveryFee) : undefined,
    commissionRate: values.commissionRate !== undefined ? Number(values.commissionRate) : undefined,
    paymentMethods: values.paymentMethods,
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
