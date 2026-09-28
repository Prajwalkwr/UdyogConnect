/**
 * Sends the browser to eSewa with the form the backend signed. Every value, including the
 * merchant code and amounts, comes from the server response and must be posted unchanged.
 */
export function redirectToEsewa({ action, fields }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.style.display = 'none';
  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value ?? '');
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

export const ORDER_FLOW_STEPS = [
  { key: 'paid', label: 'Paid' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'dispatched', label: 'Out for Delivery' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_RANK = { placed: 0, accepted: 1, preparing: 2, dispatched: 3, completed: 4 };

/** Which checklist steps are done for an order (the first step is "Paid" for prepaid orders, "Placed" for COD/QR). */
export function orderFlowProgress(order) {
  const rank = STATUS_RANK[order?.status] ?? -1;
  const prepaid = order?.paymentStatus === 'paid' || ['eSewa', 'Card'].includes(order?.paymentMethod);
  return ORDER_FLOW_STEPS.map((step, index) => {
    if (index === 0) {
      return { ...step, label: prepaid ? 'Paid' : 'Order Placed', done: rank >= 0 };
    }
    return { ...step, done: rank >= index };
  });
}

export const ORDER_STATUS_LABELS = {
  placed: 'Pending Seller Acceptance',
  accepted: 'Accepted',
  preparing: 'Preparing',
  dispatched: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};
