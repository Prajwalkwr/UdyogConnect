const express = require('express');

const REPORT_REASONS = {
  spam: 'Spam or advertising',
  fake: 'Fake or misleading',
  offensive: 'Offensive or abusive',
  inappropriate: 'Inappropriate content',
  scam: 'Scam or fraud',
  wrong_info: 'Wrong business information',
  other: 'Other',
};
const TARGET_TYPES = ['review', 'business'];
const STATUSES = ['open', 'resolved', 'dismissed'];
const MAX_DETAILS = 500;

const sid = (value) => String(value || '').trim();
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

async function safeFindById(Model, id) {
  if (!id) return null;
  try {
    return plain(await Model.findById(id));
  } catch {
    return null;
  }
}

function createReportRoutes({ authenticateToken, requireRole, Report, Review, Business, User, AuditLog }) {
  const router = express.Router();

  const audit = async (userId, action, details) => {
    try {
      await AuditLog().create({ userId, action, details });
    } catch (err) {
      console.error('Report audit log failed:', err && err.message);
    }
  };

  const syncReviewFlag = async (reviewId) => {
    const open = await Report().find({ targetType: 'review', targetId: reviewId, status: 'open' });
    const count = Array.isArray(open) ? open.length : 0;
    try {
      await Review().findByIdAndUpdate(reviewId, { reported: count > 0, reportCount: count });
    } catch {
      /* review may already be gone */
    }
  };

  const recomputeBusinessRating = async (businessId) => {
    if (!businessId) return;
    const reviews = await Review().find({ businessId, targetType: 'business' });
    const list = Array.isArray(reviews) ? reviews : [];
    const avg = list.length
      ? parseFloat((list.reduce((sum, r) => sum + Number(r.rating || 0), 0) / list.length).toFixed(1))
      : 0;
    await Business().findByIdAndUpdate(businessId, { rating: avg, reviewCount: list.length });
  };

  async function submitReport(req, res, { targetType, targetId, reason, details }) {
    const reporterId = sid(req.user?.id || req.user?.userId);
    targetType = sid(targetType);
    targetId = sid(targetId);
    reason = sid(reason);
    details = typeof details === 'string' ? details.trim() : '';

    if (!TARGET_TYPES.includes(targetType) || !targetId) {
      return res.status(400).json({ message: 'Choose what you are reporting.' });
    }
    if (!REPORT_REASONS[reason]) {
      return res.status(400).json({ message: 'Choose a reason for the report.' });
    }
    if (reason === 'other' && !details) {
      return res.status(400).json({ message: 'Please describe the problem.' });
    }
    if (details.length > MAX_DETAILS) {
      return res.status(400).json({ message: `Keep the description under ${MAX_DETAILS} characters.` });
    }

    let businessId = '';
    let targetSnapshot = {};
    if (targetType === 'review') {
      const review = await safeFindById(Review(), targetId);
      if (!review) return res.status(404).json({ message: 'Review not found.' });
      if (sid(review.customerId) === reporterId) {
        return res.status(400).json({ message: "You can't report your own review." });
      }
      businessId = sid(review.businessId);
      targetSnapshot = {
        comment: review.comment || '',
        rating: Number(review.rating || 0),
        customerName: review.customerName || 'Customer',
        customerId: sid(review.customerId),
      };
    } else {
      const business = await safeFindById(Business(), targetId);
      if (!business) return res.status(404).json({ message: 'Business not found.' });
      if (sid(business.ownerId) === reporterId) {
        return res.status(400).json({ message: "You can't report your own business." });
      }
      businessId = sid(business._id);
      targetSnapshot = { name: business.name || '', category: business.category || '', location: business.location || '' };
    }

    const reporter = await safeFindById(User(), reporterId);
    const filter = { targetType, targetId, reporterId };
    const existing = plain(await Report().findOne(filter));
    const alreadyOpen = existing?.status === 'open';

    const saved = plain(await Report().findOneAndUpdate(
      filter,
      {
        $set: {
          businessId,
          reporterName: reporter?.name || req.user?.name || 'User',
          reporterRole: sid(req.user?.role),
          reason,
          details: details || (alreadyOpen ? existing.details || '' : ''),
          status: 'open',
          resolution: '',
          resolvedBy: '',
          resolvedAt: null,
          targetSnapshot,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ));

    if (targetType === 'review') await syncReviewFlag(targetId);

    if (!alreadyOpen) {
      req.app.get('io')?.to('role:admin').emit('content_report', { targetType, targetId, reason });
      await audit(reporterId, 'CONTENT_REPORTED', `Reported ${targetType} ${targetId}: ${REPORT_REASONS[reason]}`);
    }

    return res.status(alreadyOpen ? 200 : 201).json({
      success: true,
      alreadyReported: alreadyOpen,
      report: { _id: saved?._id, targetType, targetId, reason, status: 'open' },
    });
  }

  router.post('/api/reports', authenticateToken, async (req, res) => {
    try {
      await submitReport(req, res, req.body || {});
    } catch (err) {
      console.error('Report submit failed:', err);
      res.status(500).json({ message: 'Could not submit the report.' });
    }
  });

  // Older clients flag reviews through this route.
  router.put('/api/reviews/:id/report', authenticateToken, async (req, res) => {
    try {
      await submitReport(req, res, {
        targetType: 'review',
        targetId: req.params.id,
        reason: req.body?.reason || 'inappropriate',
        details: req.body?.details,
      });
    } catch (err) {
      console.error('Review report failed:', err);
      res.status(500).json({ message: 'Failed to flag review.' });
    }
  });

  router.get('/api/admin/content-reports/summary', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const open = await Report().find({ status: 'open' });
      res.json({ open: Array.isArray(open) ? open.length : 0 });
    } catch (err) {
      res.status(500).json({ message: 'Failed to load report summary.' });
    }
  });

  router.get('/api/admin/content-reports', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const status = STATUSES.includes(req.query.status) ? req.query.status : req.query.status === 'all' ? 'all' : 'open';
      const all = (await Report().find({})).map(plain);
      const counts = { open: 0, resolved: 0, dismissed: 0 };
      all.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });

      const groups = new Map();
      all
        .filter((r) => status === 'all' || r.status === status)
        .forEach((r) => {
          const key = `${r.targetType}:${r.targetId}`;
          if (!groups.has(key)) {
            groups.set(key, { key, targetType: r.targetType, targetId: r.targetId, businessId: r.businessId, reports: [] });
          }
          groups.get(key).reports.push({
            _id: r._id,
            reporterId: r.reporterId,
            reporterName: r.reporterName,
            reporterRole: r.reporterRole,
            reason: r.reason,
            reasonLabel: REPORT_REASONS[r.reason] || r.reason,
            details: r.details,
            status: r.status,
            resolution: r.resolution,
            resolvedAt: r.resolvedAt,
            createdAt: r.createdAt,
            targetSnapshot: r.targetSnapshot || {},
          });
        });

      const businessCache = new Map();
      const businessFor = async (id) => {
        if (!id) return null;
        if (!businessCache.has(id)) businessCache.set(id, await safeFindById(Business(), id));
        return businessCache.get(id);
      };

      const items = await Promise.all([...groups.values()].map(async (group) => {
        group.reports.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        const snapshot = group.reports[0]?.targetSnapshot || {};
        const business = await businessFor(group.businessId);
        let target;
        if (group.targetType === 'review') {
          const review = await safeFindById(Review(), group.targetId);
          target = review
            ? { exists: true, comment: review.comment, rating: Number(review.rating || 0), customerName: review.customerName }
            : { exists: false, ...snapshot };
        } else {
          target = business
            ? { exists: true, name: business.name, category: business.category, location: business.location, approvalStatus: business.approvalStatus, verified: business.verified }
            : { exists: false, ...snapshot };
        }
        return {
          ...group,
          businessName: business?.name || snapshot.name || '',
          target,
          openCount: group.reports.filter((r) => r.status === 'open').length,
          latestAt: group.reports[0]?.createdAt || null,
        };
      }));

      items.sort((a, b) => (b.openCount > 0) - (a.openCount > 0) || new Date(b.latestAt || 0) - new Date(a.latestAt || 0));
      res.json({ status, counts, items });
    } catch (err) {
      console.error('Load content reports failed:', err);
      res.status(500).json({ message: 'Failed to load reports.' });
    }
  });

  router.post('/api/admin/content-reports/action', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const targetType = sid(req.body?.targetType);
      const targetId = sid(req.body?.targetId);
      const action = sid(req.body?.action);
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, MAX_DETAILS) : '';
      if (!TARGET_TYPES.includes(targetType) || !targetId) {
        return res.status(400).json({ message: 'Unknown report target.' });
      }
      if (!['dismiss', 'resolve', 'remove_review'].includes(action)) {
        return res.status(400).json({ message: 'Unknown moderation action.' });
      }
      if (action === 'remove_review' && targetType !== 'review') {
        return res.status(400).json({ message: 'Only reviews can be removed from here.' });
      }

      const open = (await Report().find({ targetType, targetId, status: 'open' })).map(plain);
      if (!open.length) return res.status(409).json({ message: 'These reports were already handled.' });

      let resolution = note;
      if (action === 'remove_review') {
        const review = await safeFindById(Review(), targetId);
        if (review) {
          await Review().deleteOne({ _id: review._id });
          await recomputeBusinessRating(sid(review.businessId));
        }
        resolution = note || 'Review removed by admin.';
      } else if (action === 'dismiss') {
        resolution = note || 'No violation found.';
      } else {
        resolution = note || 'Handled by admin.';
      }

      const nextStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
      const adminId = sid(req.user?.id || req.user?.userId);
      const resolvedAt = new Date();
      await Promise.all(open.map((r) => Report().findByIdAndUpdate(r._id, {
        status: nextStatus,
        resolution,
        resolvedBy: adminId,
        resolvedAt,
      })));

      if (targetType === 'review' && action !== 'remove_review') await syncReviewFlag(targetId);
      await audit(adminId, 'CONTENT_REPORT_ACTION', `${action} on ${targetType} ${targetId} (${open.length} report(s)). ${resolution}`);
      res.json({ success: true, status: nextStatus, handled: open.length });
    } catch (err) {
      console.error('Report action failed:', err);
      res.status(500).json({ message: 'Could not update the reports.' });
    }
  });

  // Older admin screens cleared a review flag directly.
  router.put('/api/admin/reviews/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const review = await safeFindById(Review(), req.params.id);
      if (!review) return res.status(404).json({ message: 'Review not found.' });
      if (!req.body?.reported) {
        const open = (await Report().find({ targetType: 'review', targetId: sid(review._id), status: 'open' })).map(plain);
        await Promise.all(open.map((r) => Report().findByIdAndUpdate(r._id, {
          status: 'dismissed',
          resolution: 'No violation found.',
          resolvedBy: sid(req.user?.id),
          resolvedAt: new Date(),
        })));
      }
      const updated = await Review().findByIdAndUpdate(review._id, { reported: Boolean(req.body?.reported) }, { new: true });
      if (!req.body?.reported) await syncReviewFlag(sid(review._id));
      res.json({ success: true, review: updated });
    } catch (err) {
      res.status(500).json({ message: 'Failed to update review moderation state.' });
    }
  });

  return router;
}

module.exports = { createReportRoutes, REPORT_REASONS };
