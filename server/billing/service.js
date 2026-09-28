const mongoose = require('mongoose');
const { Order, Business, User, getIsMongo, nextSequence } = require('../db');
const { buildBillData, formatBillNumber, billDayKey, billPdfFilename } = require('./billData');
const { generateBillPDF } = require('../utils/generateBillPDF');
const { sendBillEmail } = require('../utils/sendBillEmail');

// A send that crashed mid-way (e.g. process restart) must not block retries forever.
const EMAIL_LOCK_MS = 2 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_BILL_NUMBER_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AFTER = { returnDocument: 'after' };

class BillingError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const sid = (value) => String(value ?? '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isValidOrderId(orderId) {
  const id = sid(orderId);
  if (!id) return false;
  if (getIsMongo()) return /^[a-f0-9]{24}$/i.test(id) && mongoose.isValidObjectId(id);
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

async function loadOrder(orderId) {
  if (!isValidOrderId(orderId)) return null;
  try {
    return plain(await Order().findById(sid(orderId)));
  } catch (_) {
    return null;
  }
}

async function safeFindById(modelFactory, id) {
  if (!id) return null;
  try {
    return plain(await modelFactory().findById(sid(id)));
  } catch (_) {
    return null;
  }
}

/** Returns the caller's relationship to the order, or null when they must not see it. */
async function resolveOrderAccess(user, order) {
  if (!user || !order) return null;
  const userId = sid(user.id || user.userId);
  if (user.role === 'admin') return 'admin';
  if (userId && sid(order.customerId) === userId) return 'customer';
  if (user.role === 'seller') {
    const business = await safeFindById(Business, order.businessId);
    if (business && sid(business.ownerId) === userId) return 'seller';
  }
  if (user.role === 'rider' && order.deliveryRiderId && sid(order.deliveryRiderId) === userId) return 'rider';
  return null;
}

/** Loads the order and enforces ownership; unknown and foreign orders both look like 404. */
async function loadAuthorizedOrder(user, orderId, allowedAccess = ['admin', 'customer', 'seller']) {
  if (!isValidOrderId(orderId)) throw new BillingError(400, 'Invalid order ID.');
  const order = await loadOrder(orderId);
  const access = order ? await resolveOrderAccess(user, order) : null;
  if (!order || !access || !allowedAccess.includes(access)) throw new BillingError(404, 'Order not found.');
  return { order, access };
}

/**
 * Card/wallet orders are billed only after the backend has verified payment. COD and QR orders
 * are billed when the order is confirmed, showing the payment as pending.
 */
function billEligibility(order) {
  if (order.billNumber) return { ok: true };
  if (order.status === 'cancelled') return { ok: false, reason: 'Cancelled orders are not billed.' };
  const method = String(order.paymentMethod || 'COD');
  if (['Card', 'Wallet'].includes(method) && order.paymentStatus !== 'paid') {
    return { ok: false, reason: 'The bill will be available once your payment is confirmed.' };
  }
  return { ok: true };
}

const isDuplicateKeyError = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));

/** Assigns a unique UC-YYYYMMDD-XXXXXX number exactly once; concurrent callers get the same number. */
async function ensureBillNumber(order) {
  if (order.billNumber) return order;
  const OrderMDL = Order();

  for (let attempt = 0; attempt < MAX_BILL_NUMBER_ATTEMPTS; attempt += 1) {
    const now = new Date();
    const billNumber = formatBillNumber(now, await nextSequence(billDayKey(now)));

    if (!getIsMongo() && await OrderMDL.findOne({ billNumber })) continue;

    try {
      const claimed = await OrderMDL.findOneAndUpdate(
        { _id: order._id, billNumber: { $exists: false } },
        { $set: { billNumber, billGeneratedAt: now, billPdfFilename: billPdfFilename(billNumber) } },
        AFTER
      );
      if (claimed) return plain(claimed);
      const current = await loadOrder(order._id);
      if (current?.billNumber) return current;
      throw new Error('Order disappeared while assigning a bill number.');
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  throw new Error('Could not allocate a unique bill number.');
}

async function loadBillContext(order) {
  const [business, customer] = await Promise.all([
    safeFindById(Business, order.businessId),
    safeFindById(User, order.customerId),
  ]);
  return { business, customer };
}

/** The email typed in the checkout Delivery Details, falling back to the account email for older orders. */
function resolveCustomerEmail(order, customer) {
  const checkoutEmail = sid(order.deliveryAddress?.email).toLowerCase();
  if (EMAIL_PATTERN.test(checkoutEmail)) return checkoutEmail;
  const accountEmail = sid(customer?.email).toLowerCase();
  return EMAIL_PATTERN.test(accountEmail) ? accountEmail : '';
}

async function buildBillForAudience(order, audience) {
  const context = await loadBillContext(order);
  return buildBillData(order, { ...context, audience });
}

async function renderBillPdf(order, audience = 'customer') {
  const bill = await buildBillForAudience(order, audience);
  const pdf = await generateBillPDF(bill);
  return { bill, pdf };
}

const trimError = (err) => String(err?.message || err || 'Unknown error').slice(0, 300);

/**
 * Sends the bill email under a database lock so that concurrent triggers (double submit,
 * webhook + redirect, retries) cannot produce more than one email. `force` is only used by
 * the explicit resend action.
 */
async function deliverBillEmail(orderId, { force = false } = {}) {
  const OrderMDL = Order();
  const now = new Date();
  const filter = {
    _id: orderId,
    billNumber: { $exists: true },
    $or: [{ billEmailLockedAt: null }, { billEmailLockedAt: { $lt: new Date(now.getTime() - EMAIL_LOCK_MS) } }],
  };
  if (!force) filter.billEmailSent = { $ne: true };

  const claimed = plain(await OrderMDL.findOneAndUpdate(
    filter,
    { $set: { billEmailLockedAt: now, billEmailStatus: 'sending', billEmailLastAttemptAt: now }, $inc: { billEmailAttempts: 1 } },
    AFTER
  ));
  if (!claimed) {
    const current = await loadOrder(orderId);
    return { status: current?.billEmailSent ? 'already_sent' : 'in_progress', order: current };
  }

  const previouslySent = Boolean(claimed.billEmailSent);
  const release = async (error) => {
    await OrderMDL.findByIdAndUpdate(orderId, {
      $set: {
        billEmailLockedAt: null,
        billEmailStatus: previouslySent ? 'sent' : 'failed',
        billEmailError: error,
      },
    });
    return { status: 'failed', error, order: await loadOrder(orderId) };
  };

  let bill;
  let pdf;
  let recipient;
  try {
    const context = await loadBillContext(claimed);
    recipient = resolveCustomerEmail(claimed, context.customer);
    bill = buildBillData(claimed, { ...context, audience: 'customer' });
    pdf = await generateBillPDF(bill);
  } catch (err) {
    console.error(`[billing] Bill generation failed for order ${orderId}:`, trimError(err));
    return release('Bill generation failed.');
  }

  try {
    await sendBillEmail({ to: recipient, bill, pdfBuffer: pdf });
  } catch (err) {
    console.error(`[billing] Bill email failed for order ${orderId} (${bill.billNumber}):`, trimError(err));
    return release(trimError(err));
  }

  await OrderMDL.findByIdAndUpdate(orderId, {
    $set: {
      billEmailSent: true,
      billEmailSentAt: new Date(),
      billEmailStatus: 'sent',
      billEmailTo: recipient,
      billEmailError: '',
      billEmailLockedAt: null,
    },
  });
  console.log(`[billing] Bill ${bill.billNumber} emailed for order ${orderId}.`);
  return { status: 'sent', order: await loadOrder(orderId) };
}

/**
 * Idempotently issues the bill for an order: assigns the bill number and emails it once.
 * Waits up to `waitMs` for the email so the checkout response can report its status; the
 * email keeps going in the background if it takes longer.
 */
async function issueBill(orderId, { waitMs = 0 } = {}) {
  const order = await loadOrder(orderId);
  if (!order) return { issued: false, reason: 'Order not found.' };

  const eligibility = billEligibility(order);
  if (!eligibility.ok) return { issued: false, reason: eligibility.reason, order };

  let billed;
  try {
    billed = await ensureBillNumber(order);
  } catch (err) {
    console.error(`[billing] Bill generation failed for order ${orderId}:`, trimError(err));
    return { issued: false, reason: 'Bill generation failed.', order };
  }
  if (billed.billEmailSent) return { issued: true, order: billed };

  const delivery = deliverBillEmail(billed._id).catch((err) => {
    console.error(`[billing] Unexpected bill email error for order ${orderId}:`, trimError(err));
  });
  if (waitMs > 0) await Promise.race([delivery, sleep(waitMs)]);
  return { issued: true, order: (await loadOrder(orderId)) || billed };
}

/** Explicit resend: same bill number, new email, rate limited per order. */
async function resendBill(order) {
  const eligibility = billEligibility(order);
  if (!eligibility.ok) throw new BillingError(409, eligibility.reason);
  const billed = await ensureBillNumber(order);
  const lastAttempt = billed.billEmailLastAttemptAt ? new Date(billed.billEmailLastAttemptAt).getTime() : 0;
  const waitMs = lastAttempt + RESEND_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    throw new BillingError(429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before resending the bill.`, { retryAfter: Math.ceil(waitMs / 1000) });
  }
  return deliverBillEmail(billed._id, { force: true });
}

/** Sends the bill only if it has never been emailed successfully (safe retry after a failure). */
async function sendBillIfNeeded(order) {
  const eligibility = billEligibility(order);
  if (!eligibility.ok) throw new BillingError(409, eligibility.reason);
  const billed = await ensureBillNumber(order);
  if (billed.billEmailSent) return { status: 'already_sent', order: billed };
  return deliverBillEmail(billed._id);
}

/**
 * Marks a card order as paid after the payment provider confirmed it, then issues the bill.
 * Safe to call repeatedly from both the redirect verification and the webhook.
 */
async function finalizeCardPayment({ orderId, transactionId = '', sessionId = '', waitMs = 0 }) {
  const OrderMDL = Order();
  const now = new Date();
  const updated = plain(await OrderMDL.findOneAndUpdate(
    { _id: orderId, paymentStatus: 'pending' },
    { $set: { paymentStatus: 'paid', paidAt: now, paymentTransactionId: sid(transactionId), stripeSessionId: sid(sessionId) } },
    AFTER
  ));
  if (updated) {
    await OrderMDL.findByIdAndUpdate(orderId, {
      $set: {
        trackingHistory: [...(updated.trackingHistory || []), { status: 'paid', time: now.toISOString(), note: 'Card payment confirmed.' }],
      },
    });
  }
  return issueBill(orderId, { waitMs });
}

/** Compact bill status for order lists and checkout responses. */
function billSummary(order, audience = 'customer') {
  if (!order) return null;
  return {
    billNumber: order.billNumber || null,
    billGeneratedAt: order.billGeneratedAt || null,
    pdfFilename: order.billPdfFilename || (order.billNumber ? billPdfFilename(order.billNumber) : null),
    emailSent: Boolean(order.billEmailSent),
    emailSentAt: order.billEmailSentAt || null,
    emailStatus: order.billEmailStatus || (order.billEmailSent ? 'sent' : 'not_sent'),
    emailTo: audience === 'seller' ? '' : (order.billEmailTo || ''),
  };
}

module.exports = {
  BillingError,
  isValidOrderId,
  loadOrder,
  resolveOrderAccess,
  loadAuthorizedOrder,
  billEligibility,
  ensureBillNumber,
  buildBillForAudience,
  renderBillPdf,
  resolveCustomerEmail,
  deliverBillEmail,
  issueBill,
  resendBill,
  sendBillIfNeeded,
  finalizeCardPayment,
  billSummary,
  EMAIL_LOCK_MS,
  RESEND_COOLDOWN_MS,
};
