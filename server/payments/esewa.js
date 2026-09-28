const crypto = require('crypto');

const GATEWAYS = {
  sandbox: {
    formUrl: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    statusUrl: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
  live: {
    formUrl: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    statusUrl: 'https://epay.esewa.com.np/api/epay/transaction/status/',
  },
};

/** eSewa's public sandbox merchant, used only for local development and tests. */
const SANDBOX_MERCHANT = { merchantCode: 'EPAYTEST', secretKey: '8gBm/:&EnhH.1/q' };

const REQUEST_SIGNED_FIELDS = 'total_amount,transaction_uuid,product_code';
const STATUS_TIMEOUT_MS = 10000;

const gatewayFor = (environment) => GATEWAYS[environment === 'live' ? 'live' : 'sandbox'];

/** Platform-wide default; each business can only use environments the platform allows. */
function platformEnvironment() {
  return String(process.env.ESEWA_ENV || 'sandbox').trim().toLowerCase() === 'live' ? 'live' : 'sandbox';
}

/**
 * Local stand-in for eSewa's sandbox login (which can be unavailable). Never available in live mode
 * or production; set ESEWA_SIMULATOR=false to disable it in development too.
 */
function simulatorEnabled() {
  return platformEnvironment() === 'sandbox'
    && process.env.NODE_ENV !== 'production'
    && String(process.env.ESEWA_SIMULATOR || 'true').trim().toLowerCase() !== 'false';
}

/** eSewa amounts are sent as plain decimal strings; the signed value must match the posted value exactly. */
function formatAmount(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100);
}

/** eSewa echoes amounts back formatted, e.g. "1,000.0". */
function parseAmount(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN;
}

function sign(secretKey, message) {
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function signFields(secretKey, values, signedFieldNames) {
  const message = signedFieldNames.split(',').map((field) => `${field}=${values[field] ?? ''}`).join(',');
  return sign(secretKey, message);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Transaction UUIDs may only contain letters, numbers and hyphens. */
function createTransactionUuid() {
  return `UC-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`.toUpperCase();
}

/**
 * Builds the signed form fields for eSewa ePay v2. Totals come from the database, split so that
 * amount + tax + service charge + delivery charge equals total_amount exactly.
 */
function buildPaymentForm({ merchantCode, secretKey, environment, transactionUuid, totals, successUrl, failureUrl }) {
  const total = Math.round(Number(totals.total) * 100) / 100;
  const tax = Math.round(Number(totals.tax || 0) * 100) / 100;
  const delivery = Math.round(Number(totals.deliveryFee || 0) * 100) / 100;
  const amount = Math.round((total - tax - delivery) * 100) / 100;

  const fields = {
    amount: formatAmount(amount),
    tax_amount: formatAmount(tax),
    product_service_charge: '0',
    product_delivery_charge: formatAmount(delivery),
    total_amount: formatAmount(total),
    transaction_uuid: transactionUuid,
    product_code: merchantCode,
    success_url: successUrl,
    failure_url: failureUrl,
    signed_field_names: REQUEST_SIGNED_FIELDS,
  };
  fields.signature = signFields(secretKey, fields, REQUEST_SIGNED_FIELDS);
  return { action: gatewayFor(environment).formUrl, fields };
}

/** Decodes the base64 JSON that eSewa appends to the success URL as `?data=`. */
function decodeCallbackData(encoded) {
  const text = Buffer.from(String(encoded || '').replace(/ /g, '+'), 'base64').toString('utf8');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid eSewa response.');
  return parsed;
}

/** Checks the HMAC signature eSewa puts on the callback, using the business's own secret key. */
function verifyCallbackSignature(decoded, secretKey) {
  const names = String(decoded.signed_field_names || '');
  if (!names || !decoded.signature) return false;
  const values = { ...decoded };
  return safeEqual(signFields(secretKey, values, names), decoded.signature);
}

let statusFetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`eSewa status check returned HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

/** Asks eSewa directly whether the transaction is complete (server-to-server, cannot be forged by the browser). */
async function checkTransactionStatus({ merchantCode, environment, totalAmount, transactionUuid }) {
  const params = new URLSearchParams({
    product_code: merchantCode,
    total_amount: formatAmount(totalAmount),
    transaction_uuid: transactionUuid,
  });
  return statusFetcher(`${gatewayFor(environment).statusUrl}?${params.toString()}`);
}

/** Test hook: replaces the network call to eSewa's status API. */
function setStatusFetcher(fetcher) {
  statusFetcher = fetcher;
}

module.exports = {
  SANDBOX_MERCHANT,
  platformEnvironment,
  simulatorEnabled,
  formatAmount,
  parseAmount,
  signFields,
  createTransactionUuid,
  buildPaymentForm,
  decodeCallbackData,
  verifyCallbackSignature,
  checkTransactionStatus,
  setStatusFetcher,
};
