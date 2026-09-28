const VAT_RATE = 0.13;
const NEPAL_TZ = 'Asia/Kathmandu';

const PAYMENT_METHOD_LABELS = {
  COD: 'Cash on Delivery',
  QR: 'QR Payment (eSewa / Khalti / Mobile Banking)',
  Card: 'Card (Stripe)',
  Wallet: 'Wallet',
  eSewa: 'eSewa',
};

const PAYMENT_STATUS_LABELS = {
  paid: 'PAID',
  pending: 'PENDING',
  refunded: 'REFUNDED',
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

function formatRs(value) {
  const amount = roundMoney(value);
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nepalDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { year: get('year'), month: get('month'), day: get('day') };
}

function formatNepalDate(value, { withTime = true } = {}) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: NEPAL_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' } : {}),
  }).format(date);
}

/** Customer-facing bill number: UC-YYYYMMDD-000123 (date in Nepal time). */
function formatBillNumber(date, sequence) {
  const { year, month, day } = nepalDateParts(date);
  return `UC-${year}${month}${day}-${String(sequence).padStart(6, '0')}`;
}

const billDayKey = (date = new Date()) => {
  const { year, month, day } = nepalDateParts(date);
  return `bill-${year}${month}${day}`;
};

const billPdfFilename = (billNumber) => `UdyogConnect-Bill-${billNumber}.pdf`;

/**
 * Line items with trusted unit prices. New orders store the server-resolved `unitPrice`;
 * older orders only have the browser-supplied `price`, so their lines are scaled to the
 * server-computed subtotal to keep the bill internally consistent.
 */
function resolveBillItems(order) {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems.map((item) => {
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    const hasTrustedPrice = item.unitPrice !== undefined && item.unitPrice !== null;
    const unitPrice = roundMoney(hasTrustedPrice ? item.unitPrice : item.price);
    return {
      name: String(item.name || 'Item'),
      type: item.type === 'service' ? 'service' : 'product',
      quantity,
      unitPrice,
      total: roundMoney(unitPrice * quantity),
      trusted: hasTrustedPrice,
    };
  });

  const untrusted = items.filter((item) => !item.trusted);
  const trustedSum = roundMoney(items.filter((item) => item.trusted).reduce((sum, item) => sum + item.total, 0));
  const untrustedTarget = roundMoney(roundMoney(order.subtotal) - trustedSum);
  const untrustedSum = roundMoney(untrusted.reduce((sum, item) => sum + item.total, 0));
  if (untrusted.length > 0 && untrustedSum > 0 && untrustedTarget > 0 && untrustedSum !== untrustedTarget) {
    const factor = untrustedTarget / untrustedSum;
    let running = 0;
    untrusted.forEach((item, index) => {
      if (index === untrusted.length - 1) {
        item.total = roundMoney(untrustedTarget - running);
      } else {
        item.total = roundMoney(item.total * factor);
        running = roundMoney(running + item.total);
      }
      item.unitPrice = roundMoney(item.total / item.quantity);
    });
  }

  return items.map(({ trusted, ...item }) => item);
}

/** Totals come only from stored, server-computed order values — never from the browser. */
function computeBillTotals(order, items) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const deliveryFee = roundMoney(order.deliveryFee);
  const discount = roundMoney(order.discount);
  const tax = roundMoney(order.tax);
  const total = roundMoney(subtotal + deliveryFee + tax - discount);
  if (Math.abs(total - roundMoney(order.total)) > 0.01) {
    console.warn(`[billing] Order ${order._id} stored total ${order.total} differs from recomputed ${total}; using recomputed value.`);
  }
  return { subtotal, deliveryFee, discount, tax, taxRate: tax > 0 ? VAT_RATE : 0, total };
}

function joinAddress(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

/**
 * Builds the bill view model from database records.
 * `audience` ('customer' | 'seller' | 'admin') controls privacy: sellers never receive the
 * customer's email address and only admins see raw email delivery errors.
 */
function buildBillData(order, { business = null, customer = null, audience = 'customer' } = {}) {
  const items = resolveBillItems(order);
  const totals = computeBillTotals(order, items);
  const delivery = order.deliveryAddress || {};
  const paymentStatus = String(order.paymentStatus || 'pending').toLowerCase();
  const paymentMethod = String(order.paymentMethod || 'COD');
  const customerEmail = String(delivery.email || customer?.email || '').trim();

  return {
    billNumber: order.billNumber || null,
    orderId: String(order._id),
    orderDate: order.createdAt || null,
    billGeneratedAt: order.billGeneratedAt || null,
    orderStatus: order.status || 'placed',
    paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod,
    paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus.toUpperCase(),
    paymentNote: paymentStatus === 'paid'
      ? ''
      : paymentMethod === 'COD'
        ? 'Pay in cash when your order is delivered or picked up.'
        : paymentMethod === 'QR'
          ? 'Awaiting confirmation of your QR payment by the business.'
          : 'Awaiting payment confirmation.',
    transactionId: order.paymentTransactionId || '',
    paidAt: order.paidAt || null,
    customer: {
      name: String(delivery.name || customer?.name || 'Customer'),
      email: audience === 'seller' ? '' : customerEmail,
      phone: String(delivery.phone || customer?.phone || ''),
      address: delivery.method === 'pickup'
        ? 'Self pickup'
        : joinAddress([delivery.address, delivery.location]),
    },
    business: {
      name: String(business?.name || 'UdyogConnect Seller'),
      address: joinAddress([business?.location]),
      phone: String(business?.phone || ''),
      email: String(business?.contactEmail || ''),
    },
    items,
    totals,
    pdfFilename: order.billNumber ? billPdfFilename(order.billNumber) : null,
    email: {
      sent: Boolean(order.billEmailSent),
      sentAt: order.billEmailSentAt || null,
      status: order.billEmailStatus || (order.billEmailSent ? 'sent' : 'not_sent'),
      to: audience === 'seller' ? '' : (order.billEmailTo || customerEmail),
      error: audience === 'admin' ? (order.billEmailError || '') : '',
    },
  };
}

module.exports = {
  VAT_RATE,
  PAYMENT_METHOD_LABELS,
  roundMoney,
  formatRs,
  formatNepalDate,
  formatBillNumber,
  billDayKey,
  billPdfFilename,
  resolveBillItems,
  computeBillTotals,
  buildBillData,
};
