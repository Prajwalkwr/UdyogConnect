const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  BillingError,
  loadAuthorizedOrder,
  billEligibility,
  ensureBillNumber,
  buildBillForAudience,
  renderBillPdf,
  resendBill,
  sendBillIfNeeded,
  billSummary,
} = require('./service');

const AUDIENCE_BY_ACCESS = { admin: 'admin', customer: 'customer', seller: 'seller' };

function sendError(res, err, fallback) {
  if (err instanceof BillingError) {
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    return res.status(err.status).json({ message: err.message });
  }
  console.error(`[billing] ${fallback}`, err && err.message);
  return res.status(500).json({ message: fallback });
}

/** Loads an order the caller may see and makes sure its bill number exists. */
async function loadBilledOrder(req, allowedAccess) {
  const { order, access } = await loadAuthorizedOrder(req.user, req.params.orderId, allowedAccess);
  const eligibility = billEligibility(order);
  if (!eligibility.ok) throw new BillingError(409, eligibility.reason);
  return { order: await ensureBillNumber(order), access };
}

function emailResultResponse(result, access) {
  const audience = AUDIENCE_BY_ACCESS[access];
  const summary = billSummary(result.order, audience);
  if (result.status === 'sent') {
    return { status: 200, body: { success: true, message: `Bill sent to ${summary.emailTo}.`, bill: summary } };
  }
  if (result.status === 'already_sent') {
    return { status: 200, body: { success: true, alreadySent: true, message: 'This bill has already been emailed.', bill: summary } };
  }
  if (result.status === 'in_progress') {
    return { status: 202, body: { success: true, inProgress: true, message: 'The bill email is already being sent.', bill: summary } };
  }
  // Deliberately not 5xx: the client retries 5xx automatically, which would re-send the email.
  return {
    status: 424,
    body: {
      success: false,
      message: 'We could not email the bill right now. Your order is safe — please try again shortly.',
      ...(access === 'admin' ? { error: result.error } : {}),
      bill: summary,
    },
  };
}

function createBillingRoutes() {
  const router = express.Router();

  // GET /api/orders/:orderId/bill — bill data for the customer, the owning seller, or an admin
  router.get('/:orderId/bill', authenticateToken, async (req, res) => {
    try {
      const { order, access } = await loadBilledOrder(req);
      const bill = await buildBillForAudience(order, AUDIENCE_BY_ACCESS[access]);
      res.set('Cache-Control', 'private, no-store');
      return res.json({ success: true, access, bill });
    } catch (err) {
      return sendError(res, err, 'Failed to load bill.');
    }
  });

  // GET /api/orders/:orderId/bill/download — the official PDF (?disposition=inline to view in browser)
  router.get('/:orderId/bill/download', authenticateToken, async (req, res) => {
    try {
      const { order, access } = await loadBilledOrder(req);
      const { bill, pdf } = await renderBillPdf(order, AUDIENCE_BY_ACCESS[access]);
      const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `${disposition}; filename="${bill.pdfFilename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(pdf);
    } catch (err) {
      return sendError(res, err, 'Bill generation failed.');
    }
  });

  // POST /api/orders/:orderId/send-bill — send only if never emailed successfully (retry after failure)
  router.post('/:orderId/send-bill', authenticateToken, async (req, res) => {
    try {
      const { order, access } = await loadAuthorizedOrder(req.user, req.params.orderId, ['admin', 'customer']);
      const result = await sendBillIfNeeded(order);
      const { status, body } = emailResultResponse(result, access);
      return res.status(status).json(body);
    } catch (err) {
      return sendError(res, err, 'Failed to send bill.');
    }
  });

  // POST /api/orders/:orderId/resend-bill — explicit resend with the same bill number
  router.post('/:orderId/resend-bill', authenticateToken, async (req, res) => {
    try {
      const { order, access } = await loadAuthorizedOrder(req.user, req.params.orderId, ['admin', 'customer']);
      const result = await resendBill(order);
      const { status, body } = emailResultResponse(result, access);
      return res.status(status).json(body);
    } catch (err) {
      return sendError(res, err, 'Failed to resend bill.');
    }
  });

  return router;
}

module.exports = { createBillingRoutes };
