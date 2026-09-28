const express = require('express');
const esewa = require('./esewa');
const { encryptSecret, decryptSecret } = require('./secretBox');

const MERCHANT_CODE_REGEX = /^[A-Za-z0-9_-]{3,40}$/;
const MAX_SECRET_LENGTH = 200;
const BILL_WAIT_MS = 5000;

const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const sameAmount = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;

/**
 * Multi-vendor eSewa: every business connects its own merchant account and customers pay that
 * business directly. Secret keys are encrypted at rest, only decrypted here, and never returned.
 */
function createEsewaRoutes({
  authenticateToken,
  requireRole,
  billing,
  models,
  prepareCheckout,
  persistCheckoutOrder,
  notifyNewOrder,
  resolveClientUrl,
}) {
  const { Business, PaymentCredential, EsewaPayment, Order } = models;
  const router = express.Router();

  const returnUrls = (req) => {
    const clientUrl = resolveClientUrl(req);
    return {
      successUrl: `${clientUrl}/payment/esewa/success`,
      failureUrl: `${clientUrl}/payment/esewa/failure`,
    };
  };

  const findBusiness = async (id) => {
    try {
      return toPlain(await Business().findById(id));
    } catch (_) {
      return null;
    }
  };

  /** Sellers can only manage their own business; admins must name one explicitly. */
  const resolveOwnedBusiness = async (req) => {
    const requestedId = String(req.body?.businessId || req.query?.businessId || '').trim();
    if (req.user.role === 'admin') return requestedId ? findBusiness(requestedId) : null;
    const owned = (await Business().find({ ownerId: String(req.user.id || req.user.userId) })).map(toPlain);
    if (requestedId) return owned.find((b) => String(b._id) === requestedId) || null;
    return owned[0] || null;
  };

  const loadSecretKey = async (businessId) => {
    const credential = toPlain(await PaymentCredential().findOne({ businessId: String(businessId) }));
    if (!credential || !credential.secretKeyEncrypted) return '';
    try {
      return decryptSecret(credential.secretKeyEncrypted);
    } catch (err) {
      console.error('Could not decrypt eSewa credentials for business', businessId, err.message);
      return '';
    }
  };

  const publicSettings = async (req, business) => {
    const settings = business.paymentSettings || {};
    const credential = toPlain(await PaymentCredential().findOne({ businessId: String(business._id) }));
    const urls = returnUrls(req);
    return {
      businessId: String(business._id),
      businessName: business.name || '',
      provider: 'eSewa',
      merchantCode: settings.merchantCode || '',
      environment: settings.environment || esewa.platformEnvironment(),
      platformEnvironment: esewa.platformEnvironment(),
      isConnected: Boolean(settings.isConnected && credential),
      connectedAt: settings.connectedAt || null,
      hasSecretKey: Boolean(credential && credential.secretKeyEncrypted),
      successUrl: urls.successUrl,
      failureUrl: urls.failureUrl,
      sandboxAvailable: esewa.platformEnvironment() === 'sandbox',
    };
  };

  // ---------- Business payment settings ----------

  router.get('/api/business/payment/settings', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
    try {
      const business = await resolveOwnedBusiness(req);
      if (!business) return res.status(404).json({ message: 'Register your business before connecting payments.' });
      res.json(await publicSettings(req, business));
    } catch (err) {
      res.status(500).json({ message: 'Failed to load payment settings.' });
    }
  });

  router.post('/api/business/payment/connect', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
    try {
      const business = await resolveOwnedBusiness(req);
      if (!business) return res.status(404).json({ message: 'Business not found.' });

      const environment = esewa.platformEnvironment();
      const useSandbox = req.body?.useSandboxCredentials === true;
      if (useSandbox && environment !== 'sandbox') {
        return res.status(400).json({ message: 'Sandbox credentials cannot be used on the live platform.' });
      }

      const merchantCode = useSandbox ? esewa.SANDBOX_MERCHANT.merchantCode : String(req.body?.merchantCode || '').trim();
      const secretInput = useSandbox ? esewa.SANDBOX_MERCHANT.secretKey : String(req.body?.secretKey || '').trim();
      if (!MERCHANT_CODE_REGEX.test(merchantCode)) {
        return res.status(400).json({ message: 'Enter a valid eSewa merchant code (letters, numbers, - or _).', errors: { merchantCode: 'Invalid merchant code.' } });
      }
      if (secretInput.length > MAX_SECRET_LENGTH) {
        return res.status(400).json({ message: 'The secret key is too long.', errors: { secretKey: 'Secret key is too long.' } });
      }

      const businessId = String(business._id);
      const existing = toPlain(await PaymentCredential().findOne({ businessId }));
      if (!secretInput && !(existing && existing.secretKeyEncrypted)) {
        return res.status(400).json({ message: 'Enter your eSewa secret key.', errors: { secretKey: 'Secret key is required.' } });
      }
      if (secretInput) {
        await PaymentCredential().findOneAndUpdate(
          { businessId },
          { $set: { provider: 'eSewa', secretKeyEncrypted: encryptSecret(secretInput) } },
          { upsert: true, new: true }
        );
      }

      const urls = returnUrls(req);
      await Business().findByIdAndUpdate(businessId, {
        paymentSettings: {
          provider: 'eSewa',
          merchantCode,
          environment,
          successUrl: urls.successUrl,
          failureUrl: urls.failureUrl,
          isConnected: true,
          connectedAt: new Date(),
        },
      }, { new: true });

      const updated = await findBusiness(businessId);
      res.json({ success: true, settings: await publicSettings(req, updated) });
    } catch (err) {
      console.error('eSewa connect failed', err);
      res.status(500).json({ message: 'Could not save payment settings.' });
    }
  });

  router.post('/api/business/payment/disconnect', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
    try {
      const business = await resolveOwnedBusiness(req);
      if (!business) return res.status(404).json({ message: 'Business not found.' });
      const businessId = String(business._id);
      await PaymentCredential().deleteOne({ businessId });
      await Business().findByIdAndUpdate(businessId, {
        paymentSettings: { ...(business.paymentSettings || {}), provider: 'eSewa', isConnected: false, connectedAt: null },
      });
      const updated = await findBusiness(businessId);
      res.json({ success: true, settings: await publicSettings(req, updated) });
    } catch (err) {
      res.status(500).json({ message: 'Could not disconnect eSewa.' });
    }
  });

  // ---------- Customer checkout ----------

  const loadMerchant = async (business) => {
    const settings = (business && business.paymentSettings) || {};
    if (!settings.isConnected || !settings.merchantCode) return null;
    const environment = settings.environment === 'live' ? 'live' : 'sandbox';
    if (environment !== esewa.platformEnvironment()) return null;
    const secretKey = await loadSecretKey(business._id);
    if (!secretKey) return null;
    return { merchantCode: settings.merchantCode, environment, secretKey };
  };

  const canSimulate = (attempt) => Boolean(attempt && attempt.environment === 'sandbox' && esewa.simulatorEnabled());

  const signedForm = (req, attempt, merchant) => {
    const urls = returnUrls(req);
    return esewa.buildPaymentForm({
      merchantCode: merchant.merchantCode,
      secretKey: merchant.secretKey,
      environment: merchant.environment,
      transactionUuid: attempt.transactionUuid,
      totals: { total: attempt.total, tax: attempt.tax, deliveryFee: attempt.deliveryFee },
      successUrl: urls.successUrl,
      failureUrl: `${urls.failureUrl}?tx=${encodeURIComponent(attempt.transactionUuid)}`,
    });
  };

  router.post('/api/checkout/esewa', authenticateToken, async (req, res) => {
    try {
      const customerId = String(req.user.id || req.user.userId || '');
      const checkoutKey = String(req.get('Idempotency-Key') || '').trim().slice(0, 128);

      const prepared = await prepareCheckout(req.body || {});
      if (!prepared.ok) return res.status(prepared.status).json(prepared.body);

      const merchant = await loadMerchant(prepared.business);
      if (!merchant) {
        return res.status(400).json({ message: 'This business does not accept eSewa payments yet. Please choose another payment method.' });
      }

      if (checkoutKey) {
        const previous = toPlain(await EsewaPayment().findOne({ customerId, checkoutKey }));
        if (previous && previous.status === 'completed' && previous.orderId) {
          return res.status(409).json({ message: 'This checkout has already been paid.', orderId: previous.orderId });
        }
        if (previous && previous.status === 'initiated'
          && previous.businessId === prepared.businessId
          && sameAmount(Number(previous.total), prepared.total)
          && previous.merchantCode === merchant.merchantCode) {
          const form = signedForm(req, previous, merchant);
          return res.json({ success: true, transactionUuid: previous.transactionUuid, simulator: canSimulate(previous), ...form });
        }
      }

      const attempt = toPlain(await EsewaPayment().create({
        transactionUuid: esewa.createTransactionUuid(),
        customerId,
        businessId: prepared.businessId,
        merchantCode: merchant.merchantCode,
        environment: merchant.environment,
        ...(checkoutKey ? { checkoutKey } : {}),
        items: prepared.items,
        subtotal: prepared.subtotal,
        discount: prepared.discount,
        deliveryFee: prepared.deliveryFee,
        tax: prepared.tax,
        total: prepared.total,
        deliveryAddress: prepared.deliveryAddress,
        status: 'initiated',
      }));

      const form = signedForm(req, attempt, merchant);
      res.status(201).json({ success: true, transactionUuid: attempt.transactionUuid, simulator: canSimulate(attempt), ...form });
    } catch (err) {
      console.error('eSewa checkout failed', err);
      res.status(500).json({ message: 'Could not start the eSewa payment.' });
    }
  });

  const paidResponse = (order, extra = {}) => ({
    success: true,
    paid: true,
    order,
    bill: billing.billSummary(order),
    ...extra,
  });

  const findOrderForAttempt = async (attempt) => {
    if (attempt.orderId) {
      const byId = await billing.loadOrder(attempt.orderId);
      if (byId) return byId;
    }
    return toPlain(await Order().findOne({ esewaTransactionUuid: attempt.transactionUuid }));
  };

  /**
   * Called by the success page with eSewa's `data` payload. The order is only created after
   * the signature, merchant, amount and eSewa's own status API all agree the payment is complete.
   */
  router.post('/api/payment/esewa/verify', authenticateToken, async (req, res) => {
    const customerId = String(req.user.id || req.user.userId || '');
    let claimed = null;
    try {
      let decoded = null;
      let transactionUuid = String(req.body?.transactionUuid || '').trim();
      if (req.body?.data) {
        try {
          decoded = esewa.decodeCallbackData(req.body.data);
        } catch (_) {
          return res.status(400).json({ message: 'The eSewa response could not be read.' });
        }
        transactionUuid = String(decoded.transaction_uuid || '').trim();
      }
      if (!transactionUuid) return res.status(400).json({ message: 'Missing eSewa transaction.' });

      const attempt = toPlain(await EsewaPayment().findOne({ transactionUuid }));
      if (!attempt || attempt.customerId !== customerId) {
        return res.status(404).json({ message: 'Payment not found.' });
      }

      if (attempt.status === 'completed') {
        const order = await findOrderForAttempt(attempt);
        if (order) return res.json(paidResponse(order, { duplicate: true }));
      }

      const business = await findBusiness(attempt.businessId);
      const secretKey = await loadSecretKey(attempt.businessId);
      if (!business || !secretKey) {
        return res.status(409).json({ message: 'The business payment account is unavailable. Contact the business before paying again.' });
      }

      if (decoded) {
        if (!esewa.verifyCallbackSignature(decoded, secretKey)) {
          return res.status(400).json({ message: 'The eSewa payment signature is invalid.' });
        }
        if (String(decoded.product_code || '') !== attempt.merchantCode) {
          return res.status(400).json({ message: 'The payment was made to a different merchant.' });
        }
        if (!sameAmount(esewa.parseAmount(decoded.total_amount), Number(attempt.total))) {
          return res.status(400).json({ message: 'The paid amount does not match the order total.' });
        }
        if (String(decoded.status || '').toUpperCase() !== 'COMPLETE') {
          return res.status(400).json({ message: `eSewa reported the payment as ${decoded.status || 'incomplete'}.` });
        }
      }

      const simulated = Boolean(attempt.simulatedAt) && canSimulate(attempt);
      let statusResult;
      try {
        statusResult = simulated
          ? { status: 'COMPLETE', product_code: attempt.merchantCode, total_amount: attempt.total, ref_id: `SIM-${transactionUuid}` }
          : await esewa.checkTransactionStatus({
            merchantCode: attempt.merchantCode,
            environment: attempt.environment,
            totalAmount: attempt.total,
            transactionUuid,
          });
      } catch (err) {
        console.error('eSewa status check failed', err.message);
        return res.status(502).json({ message: 'We could not confirm the payment with eSewa yet. Please retry in a moment.', retryable: true });
      }
      const gatewayStatus = String(statusResult?.status || '').toUpperCase();
      if (gatewayStatus === 'PENDING' || gatewayStatus === 'AMBIGUOUS') {
        return res.status(202).json({ success: false, paid: false, pending: true, message: 'eSewa is still processing this payment. Please retry shortly.' });
      }
      if (gatewayStatus !== 'COMPLETE') {
        await EsewaPayment().findOneAndUpdate(
          { transactionUuid, status: { $in: ['initiated', 'failed'] } },
          { $set: { status: 'failed', failureReason: `eSewa status: ${gatewayStatus || 'unknown'}` } }
        );
        return res.status(400).json({ success: false, paid: false, message: 'eSewa did not confirm this payment.' });
      }
      if (statusResult.product_code && String(statusResult.product_code) !== attempt.merchantCode) {
        return res.status(400).json({ message: 'The payment was made to a different merchant.' });
      }
      if (statusResult.total_amount !== undefined && !sameAmount(esewa.parseAmount(statusResult.total_amount), Number(attempt.total))) {
        return res.status(400).json({ message: 'The paid amount does not match the order total.' });
      }

      claimed = toPlain(await EsewaPayment().findOneAndUpdate(
        { transactionUuid, status: { $in: ['initiated', 'failed'] } },
        { $set: { status: 'processing' } },
        { new: true }
      ));
      if (!claimed) {
        const current = toPlain(await EsewaPayment().findOne({ transactionUuid }));
        if (current && current.status === 'completed') {
          const order = await findOrderForAttempt(current);
          if (order) return res.json(paidResponse(order, { duplicate: true }));
        }
        return res.status(409).json({ message: 'This payment is already being confirmed. Please refresh in a moment.', retryable: true });
      }

      const transactionCode = String(decoded?.transaction_code || '').slice(0, 64);
      const refId = String(statusResult.ref_id || '').slice(0, 64);
      let order = await findOrderForAttempt(claimed);
      if (!order) {
        try {
          order = await persistCheckoutOrder(customerId, {
            businessId: claimed.businessId,
            items: claimed.items,
            subtotal: claimed.subtotal,
            discount: claimed.discount,
            deliveryFee: claimed.deliveryFee,
            tax: claimed.tax,
            total: claimed.total,
            deliveryAddress: claimed.deliveryAddress,
          }, {
            paymentMethod: 'eSewa',
            paymentStatus: 'paid',
            paidAt: new Date(),
            paymentTransactionId: refId || transactionCode || transactionUuid,
            esewaTransactionUuid: transactionUuid,
            trackingHistory: [{
              status: 'placed',
              time: new Date().toISOString(),
              note: simulated
                ? `Simulated eSewa sandbox payment (test only, ref ${refId}). Waiting for the business to accept.`
                : `Paid with eSewa (ref ${refId || transactionCode || transactionUuid}). Waiting for the business to accept.`,
            }],
          });
        } catch (err) {
          const existing = err && err.code === 11000 ? await findOrderForAttempt(claimed) : null;
          if (!existing) throw err;
          order = existing;
        }
      }

      await EsewaPayment().findOneAndUpdate(
        { transactionUuid },
        { $set: { status: 'completed', orderId: String(order._id), transactionCode, refId, verifiedAt: new Date(), failureReason: '' } }
      );
      claimed = null;

      const billResult = await billing.issueBill(order._id, { waitMs: BILL_WAIT_MS });
      const finalOrder = billResult.order || order;
      res.status(201).json(paidResponse(finalOrder));
      notifyNewOrder(req.app.get('io'), finalOrder);
    } catch (err) {
      console.error('eSewa verification failed', err);
      if (claimed) {
        await EsewaPayment().findOneAndUpdate(
          { transactionUuid: claimed.transactionUuid, status: 'processing' },
          { $set: { status: 'initiated' } }
        ).catch(() => null);
      }
      res.status(500).json({ message: 'Payment verification failed. If you were charged, retry in a moment — you will not be charged twice.', retryable: true });
    }
  });

  // ---------- Development-only sandbox simulator ----------

  const loadSimulatableAttempt = async (req, res, transactionUuid) => {
    const customerId = String(req.user.id || req.user.userId || '');
    const attempt = toPlain(await EsewaPayment().findOne({ transactionUuid: String(transactionUuid || '').trim() }));
    if (!attempt || attempt.customerId !== customerId || !canSimulate(attempt)) {
      res.status(404).json({ message: 'Test payment not available.' });
      return null;
    }
    return attempt;
  };

  router.get('/api/payment/esewa/simulate/:transactionUuid', authenticateToken, async (req, res) => {
    try {
      const attempt = await loadSimulatableAttempt(req, res, req.params.transactionUuid);
      if (!attempt) return;
      const business = await findBusiness(attempt.businessId);
      res.json({
        transactionUuid: attempt.transactionUuid,
        status: attempt.status,
        businessName: business?.name || '',
        merchantCode: attempt.merchantCode,
        amount: Math.round((Number(attempt.total) - Number(attempt.tax || 0) - Number(attempt.deliveryFee || 0)) * 100) / 100,
        tax: attempt.tax,
        deliveryFee: attempt.deliveryFee,
        total: attempt.total,
      });
    } catch (err) {
      res.status(500).json({ message: 'Could not load the test payment.' });
    }
  });

  /** Plays eSewa's part: marks the sandbox attempt as paid and returns the signed callback eSewa would send. */
  router.post('/api/payment/esewa/simulate', authenticateToken, async (req, res) => {
    try {
      const attempt = await loadSimulatableAttempt(req, res, req.body?.transactionUuid);
      if (!attempt) return;
      if (!['initiated', 'failed', 'completed'].includes(attempt.status)) {
        return res.status(409).json({ message: 'This payment is already being confirmed.' });
      }
      const secretKey = await loadSecretKey(attempt.businessId);
      if (!secretKey) return res.status(409).json({ message: 'The business payment account is unavailable.' });

      if (attempt.status !== 'completed') {
        await EsewaPayment().findOneAndUpdate(
          { transactionUuid: attempt.transactionUuid, status: { $in: ['initiated', 'failed'] } },
          { $set: { simulatedAt: new Date() } }
        );
      }
      const names = 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const callback = {
        transaction_code: `SIM${Date.now().toString(36).toUpperCase()}`,
        status: 'COMPLETE',
        total_amount: esewa.formatAmount(attempt.total),
        transaction_uuid: attempt.transactionUuid,
        product_code: attempt.merchantCode,
        signed_field_names: names,
      };
      callback.signature = esewa.signFields(secretKey, callback, names);
      res.json({ success: true, data: Buffer.from(JSON.stringify(callback)).toString('base64') });
    } catch (err) {
      console.error('eSewa simulator failed', err);
      res.status(500).json({ message: 'Could not complete the test payment.' });
    }
  });

  // The customer cancelled or eSewa declined. Nothing was paid, so no order is created.
  router.post('/api/payment/esewa/failure', authenticateToken, async (req, res) => {
    try {
      const customerId = String(req.user.id || req.user.userId || '');
      const transactionUuid = String(req.body?.transactionUuid || '').trim();
      if (!transactionUuid) return res.json({ success: true });
      await EsewaPayment().findOneAndUpdate(
        { transactionUuid, customerId, status: 'initiated' },
        { $set: { status: 'failed', failureReason: 'Cancelled or declined on eSewa.' } }
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: 'Could not record the cancelled payment.' });
    }
  });

  return router;
}

module.exports = { createEsewaRoutes };
