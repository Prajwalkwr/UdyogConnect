const crypto = require('crypto');
const express = require('express');

const MAX_OTP_ATTEMPTS = 5;
const OTP_REGEX = /^\d{6}$/;

const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

/** Six-digit delivery code generated when the business dispatches an order. */
const generateDeliveryOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/** Only the customer may see the delivery OTP; the business must get it from the customer at the door. */
const sanitizeOrderFor = (order, access) => {
  const plain = toPlain(order);
  if (!plain || typeof plain !== 'object') return plain;
  if (access === 'customer') return plain;
  const { deliveryOtp, ...rest } = plain;
  return { ...rest, hasDeliveryOtp: Boolean(deliveryOtp) };
};

const otpMatches = (expected, provided) => {
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(provided || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const STATUS_NOTES = {
  accepted: 'Order accepted by the business.',
  rejected: 'Order rejected by the business.',
  preparing: 'The business is preparing your order.',
  dispatched: 'Order is out for delivery.',
  completed: 'Order delivered and confirmed.',
};

const CUSTOMER_MESSAGES = {
  accepted: 'Your order has been accepted by the business.',
  rejected: 'Your order was rejected by the business.',
  preparing: 'Your order is being prepared.',
  dispatched: 'Your order is out for delivery! Share your delivery OTP only when you receive it.',
  completed: 'Your order is complete. Thank you!',
};

/**
 * Seller order flow: placed -> accepted -> preparing -> dispatched -> completed.
 * Every transition is an atomic conditional update on the current status, so double clicks
 * or two staff members acting at once cannot apply the same step twice.
 */
function createOrderLifecycleRoutes({ authenticateToken, requireRole, billing, Order, Business, Product }) {
  const router = express.Router();

  const loadWithAccess = async (req) => {
    const order = await billing.loadOrder(req.params.id);
    const access = order ? await billing.resolveOrderAccess(req.user, order) : null;
    return { order, access };
  };

  const emitStatus = (req, order, status, extra = {}) => {
    const io = req.app.get('io');
    if (!io || !order) return;
    const payload = { orderId: String(order._id), status, note: CUSTOMER_MESSAGES[status] || `Order updated to ${status}.`, ...extra };
    if (order.customerId) io.to(`user:${order.customerId}`).emit('order_status_update', payload);
    io.to('role:admin').emit('order_status_update', payload);
    Business().findById(order.businessId)
      .then((biz) => { if (biz && biz.ownerId) io.to(`user:${biz.ownerId}`).emit('order_status_update', payload); })
      .catch(() => {});
  };

  const transition = async (order, fromStatuses, toStatus, patch = {}, note) => {
    const trackingHistory = [
      ...(order.trackingHistory || []),
      { status: toStatus, time: new Date().toISOString(), note: note || STATUS_NOTES[toStatus] },
    ];
    let updated = null;
    try {
      updated = await Order().findOneAndUpdate(
        { _id: order._id, status: { $in: fromStatuses } },
        { $set: { status: toStatus, trackingHistory, ...patch } },
        { new: true }
      );
    } catch (_) {
      updated = null;
    }
    return toPlain(updated);
  };

  const requireSeller = (res, access) => {
    if (!['seller', 'admin'].includes(access)) {
      res.status(403).json({ message: 'Only the business that owns this order can do this.' });
      return false;
    }
    return true;
  };

  const completionPatch = (order, proof) => ({
    deliveryProof: proof,
    deliveredAt: new Date(),
    ...(order.paymentMethod === 'COD' && order.paymentStatus !== 'paid' ? { paymentStatus: 'paid', paidAt: new Date() } : {}),
  });

  const simpleSellerStep = (path, fromStatuses, toStatus, buildPatch) => {
    router.patch(path, authenticateToken, async (req, res) => {
      try {
        const { order, access } = await loadWithAccess(req);
        if (!order || !access) return res.status(404).json({ message: 'Order not found.' });
        if (!requireSeller(res, access)) return;
        if (!fromStatuses.includes(order.status)) {
          return res.status(409).json({ message: `This order is ${order.status} and cannot be moved to ${toStatus}.` });
        }
        const patch = buildPatch ? await buildPatch(req, order) : {};
        if (patch && patch.error) return res.status(400).json({ message: patch.error });
        const updated = await transition(order, fromStatuses, toStatus, patch, req.body?.note);
        if (!updated) return res.status(409).json({ message: 'This order was updated by someone else. Please refresh.' });
        res.json({ success: true, order: sanitizeOrderFor(updated, access) });
        emitStatus(req, updated, toStatus);
      } catch (err) {
        console.error(`Order ${toStatus} failed`, err);
        res.status(500).json({ message: 'Order update failed.' });
      }
    });
  };

  // Orders for the signed-in business owner (admins see every business).
  router.get('/api/business/orders', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
    try {
      let orders;
      if (req.user.role === 'admin') {
        orders = await Order().find({});
      } else {
        const bizs = await Business().find({ ownerId: String(req.user.id || req.user.userId) });
        const groups = await Promise.all(bizs.map((b) => Order().find({ businessId: String(b._id) })));
        orders = groups.flat();
      }
      const status = String(req.query.status || '').trim();
      const access = req.user.role === 'admin' ? 'admin' : 'seller';
      const list = orders
        .map(toPlain)
        .filter((o) => !status || o.status === status)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 200)
        .map((o) => sanitizeOrderFor(o, access));
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: 'Failed to load business orders.' });
    }
  });

  simpleSellerStep('/api/orders/:id/accept', ['placed'], 'accepted');

  simpleSellerStep('/api/orders/:id/reject', ['placed'], 'rejected', async (req, order) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    for (const item of order.items || []) {
      if (item.type === 'service' || !item.id) continue;
      try {
        await Product().findByIdAndUpdate(item.id, { $inc: { stock: Number(item.quantity) || 0 } });
      } catch (_) {}
    }
    return { rejectionReason: reason || 'Rejected by the business.' };
  });

  simpleSellerStep('/api/orders/:id/preparing', ['accepted'], 'preparing');

  simpleSellerStep('/api/orders/:id/dispatch', ['accepted', 'preparing'], 'dispatched', async () => ({
    deliveryOtp: generateDeliveryOtp(),
    deliveryOtpAttempts: 0,
    dispatchedAt: new Date(),
  }));

  // The delivery OTP can be entered by the business at the door or by the customer.
  router.post('/api/orders/:id/verify-otp', authenticateToken, async (req, res) => {
    try {
      const { order, access } = await loadWithAccess(req);
      if (!order || !access) return res.status(404).json({ message: 'Order not found.' });
      if (order.status !== 'dispatched') {
        return res.status(409).json({ message: 'The delivery OTP can only be used once the order is out for delivery.' });
      }
      const otp = String(req.body?.otp || '').trim();
      if (!OTP_REGEX.test(otp)) return res.status(400).json({ message: 'Enter the 6-digit delivery OTP.' });

      const attempts = Number(order.deliveryOtpAttempts) || 0;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        return res.status(429).json({ message: 'Too many wrong OTP attempts. Ask the customer to confirm with "Order Received".' });
      }
      if (!otpMatches(order.deliveryOtp, otp)) {
        await Order().findOneAndUpdate({ _id: order._id, status: 'dispatched' }, { $inc: { deliveryOtpAttempts: 1 } }).catch(() => null);
        const remaining = Math.max(0, MAX_OTP_ATTEMPTS - attempts - 1);
        return res.status(400).json({ message: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`, remainingAttempts: remaining });
      }

      const updated = await transition(order, ['dispatched'], 'completed', completionPatch(order, 'OTP verified'), 'Delivery confirmed with OTP.');
      if (!updated) return res.status(409).json({ message: 'This order was already updated. Please refresh.' });
      res.json({ success: true, order: sanitizeOrderFor(updated, access) });
      emitStatus(req, updated, 'completed');
    } catch (err) {
      console.error('OTP verification failed', err);
      res.status(500).json({ message: 'OTP verification failed.' });
    }
  });

  router.patch('/api/orders/:id/order-received', authenticateToken, async (req, res) => {
    try {
      const { order, access } = await loadWithAccess(req);
      if (!order || !access) return res.status(404).json({ message: 'Order not found.' });
      if (access !== 'customer') return res.status(403).json({ message: 'Only the customer can confirm they received the order.' });
      if (order.status !== 'dispatched') {
        return res.status(409).json({ message: 'You can confirm receipt once the order is out for delivery.' });
      }
      const updated = await transition(order, ['dispatched'], 'completed', completionPatch(order, 'Confirmed by customer'), 'Customer confirmed the order was received.');
      if (!updated) return res.status(409).json({ message: 'This order was already updated. Please refresh.' });
      res.json({ success: true, order: sanitizeOrderFor(updated, access) });
      emitStatus(req, updated, 'completed');
    } catch (err) {
      console.error('Order received confirmation failed', err);
      res.status(500).json({ message: 'Could not confirm the order.' });
    }
  });

  return router;
}

module.exports = { createOrderLifecycleRoutes, sanitizeOrderFor, generateDeliveryOtp, MAX_OTP_ATTEMPTS };
