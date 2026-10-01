const express = require('express');
const { Business, Product, ActivityEvent, getIsMongo } = require('../db');
const { buildHomeFeed, recordActivity } = require('./feedService');

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

function isValidId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  return getIsMongo() ? /^[a-f0-9]{24}$/i.test(id) : /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function readVisitorId(req) {
  const value = String(req.get('x-visitor-id') || '').trim();
  return VISITOR_ID_PATTERN.test(value) ? value : '';
}

const publicCard = ({ ownerId, ...card }) => card;

function toPublicFeed(feed) {
  const mapList = (list) => list.map(publicCard);
  return {
    ...feed,
    featured: mapList(feed.featured),
    popular: mapList(feed.popular),
    highlights: feed.highlights.map((item) => ({ ...item, business: publicCard(item.business) })),
    recommendations: Object.fromEntries(Object.entries(feed.recommendations).map(([key, list]) => [key, mapList(list)])),
  };
}

/**
 * GET  /api/home/feed      — everything the home page needs, personalised when signed in
 * POST /api/activity/view  — records a business/product view for recommendations and trending
 * DELETE /api/activity/history — resets the caller's view history used for personalisation
 */
function createHomeRoutes({ isLiveBusiness, serializeBusiness, getOptionalUser }) {
  const router = express.Router();

  router.get('/home/feed', async (req, res) => {
    try {
      const user = getOptionalUser(req);
      const feed = await buildHomeFeed({
        user,
        visitorId: readVisitorId(req),
        lat: req.query.lat,
        lng: req.query.lng,
        area: String(req.query.area || '').slice(0, 120),
      }, { isLiveBusiness, serializeBusiness });
      res.set('Cache-Control', 'private, no-store');
      return res.json(toPublicFeed(feed));
    } catch (err) {
      console.error('[home] Failed to build home feed:', err && err.message);
      return res.status(500).json({ message: 'Failed to load the home page.' });
    }
  });

  router.post('/activity/view', async (req, res) => {
    try {
      const user = getOptionalUser(req);
      const userId = String(user?.id || user?.userId || '');
      const visitorId = readVisitorId(req);
      if (!userId && !visitorId) return res.status(400).json({ message: 'Visitor id required.' });

      let businessId = String(req.body?.businessId || '').trim();
      const productId = String(req.body?.productId || '').trim();
      if (productId) {
        if (!isValidId(productId)) return res.status(400).json({ message: 'Invalid product id.' });
        const product = plain(await Product().findById(productId).catch(() => null));
        if (!product) return res.status(404).json({ message: 'Product not found.' });
        businessId = String(product.businessId || '');
      }
      if (!isValidId(businessId)) return res.status(400).json({ message: 'Invalid business id.' });
      const business = plain(await Business().findById(businessId).catch(() => null));
      if (!business || !isLiveBusiness(business)) return res.status(404).json({ message: 'Business not found.' });
      // Owners browsing their own page are not visitors.
      if (userId && String(business.ownerId) === userId) return res.status(202).json({ recorded: false });

      const result = await recordActivity({
        type: productId ? 'view_product' : 'view_business',
        userId,
        visitorId,
        businessId,
        productId,
      });
      if (result.recorded) {
        await Business().findOneAndUpdate({ _id: business._id }, { $inc: { visitorsCount: 1 } }).catch(() => {});
      }
      return res.status(202).json({ recorded: result.recorded });
    } catch (err) {
      console.error('[home] Failed to record view:', err && err.message);
      return res.status(500).json({ message: 'Failed to record view.' });
    }
  });

  // Clears the caller's own browsing signals. Orders, bookings, reviews and saved businesses are kept.
  router.delete('/activity/history', async (req, res) => {
    try {
      const user = getOptionalUser(req);
      const userId = String(user?.id || user?.userId || '');
      const visitorId = readVisitorId(req);
      if (!userId && !visitorId) return res.status(400).json({ message: 'Visitor id required.' });
      const model = ActivityEvent();
      let deleted = 0;
      if (model && userId) deleted += (await model.deleteMany({ userId })).deletedCount || 0;
      if (model && visitorId) deleted += (await model.deleteMany({ visitorId })).deletedCount || 0;
      return res.json({ message: 'Your recommendation history was reset.', deleted });
    } catch (err) {
      console.error('[home] Failed to reset activity history:', err && err.message);
      return res.status(500).json({ message: 'Failed to reset your recommendation history.' });
    }
  });

  return router;
}

module.exports = { createHomeRoutes };
