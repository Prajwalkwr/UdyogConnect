const { Business, Product, Service, Review, Order, Booking, User, ActivityEvent, getIsMongo } = require('../db');
const { categoryGroupsOf, resolvePlace, CITY_CENTERS } = require('./catalog');
const {
  bayesRating,
  buildUserProfile,
  recommendForYou,
  recommendNearby,
  recommendAlsoViewed,
  recommendTrending,
  recommendNewLocal,
  pickHighlights,
} = require('./recommend');

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TTL_MS = 30 * 1000;
const HISTORY_DAYS = 60;
const VIEW_DEDUPE_MS = 30 * 60 * 1000;
const MAX_EVENTS_PER_ACTOR_PER_DAY = 300;
const MOCK_EVENT_LIMIT = 5000;
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
const DEFAULT_PLACE = { label: 'Kathmandu', city: 'Kathmandu', lat: CITY_CENTERS.kathmandu[0], lng: CITY_CENTERS.kathmandu[1] };

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const sid = (value) => String(value ?? '').trim();
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const ageMs = (doc, now) => now - new Date(doc?.createdAt || 0).getTime();

async function loadAll(modelFactory, { sinceDays, filter = {} } = {}) {
  const model = modelFactory();
  if (!model) return [];
  const since = sinceDays ? new Date(Date.now() - sinceDays * DAY_MS) : null;
  if (getIsMongo()) {
    const query = model.find(since ? { ...filter, createdAt: { $gte: since } } : filter);
    return (typeof query.lean === 'function' ? await query.lean() : await query).map(plain);
  }
  const docs = (await model.find(filter)).map(plain);
  return since ? docs.filter((doc) => new Date(doc.createdAt || 0) >= since) : docs;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((value) => Number.isFinite(Number(value)))) return null;
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** Deals refresh at midnight Nepal time. */
function nextNepalMidnight(now = Date.now()) {
  const local = new Date(now + NEPAL_OFFSET_MS);
  local.setUTCHours(24, 0, 0, 0);
  return new Date(local.getTime() - NEPAL_OFFSET_MS).toISOString();
}

function toCard(business) {
  return {
    _id: sid(business._id),
    ownerId: sid(business.ownerId),
    name: business.name || 'Local business',
    category: business.category || '',
    subcategory: business.subcategory || '',
    location: business.location || '',
    description: String(business.description || '').slice(0, 180),
    imageUrl: business.imageUrl || business.coverUrl || '',
    coverUrl: business.coverUrl || '',
    rating: Number(business.rating) || 0,
    reviewCount: Number(business.reviewCount) || 0,
    verified: business.verified,
    latitude: business.latitude,
    longitude: business.longitude,
    hours: business.hours,
    openingDays: business.openingDays,
    openingTime: business.openingTime,
    closingTime: business.closingTime,
    manualOpenOverride: business.manualOpenOverride ?? null,
    manualOverrideAt: business.manualOverrideAt ?? null,
    deliveryAvailable: business.deliveryAvailable !== false,
    offeringType: business.offeringType || 'both',
    createdAt: business.createdAt,
    approvedAt: business.approvedAt || null,
    groups: categoryGroupsOf(business),
    priceRange: null,
    popularity: 0,
    stats: { orders7: 0, orders30: 0, bookings7: 0, bookings30: 0, views7: 0, views14: 0, reviews14: 0, wishlistCount: 0, wishlist7: 0 },
  };
}

function addToActorSet(actorSets, actor, businessId) {
  if (!actor || !businessId) return;
  const set = actorSets.get(actor) || new Set();
  set.add(businessId);
  actorSets.set(actor, set);
}

const eventActor = (event) => (event.userId ? `user:${event.userId}` : event.visitorId ? `visitor:${event.visitorId}` : '');

/** Marketplace-wide data shared by every visitor; rebuilt at most every BASE_TTL_MS. */
async function buildBase({ isLiveBusiness, serializeBusiness }) {
  const now = Date.now();
  const [allBusinesses, products, services, reviews, orders, bookings, events, users] = await Promise.all([
    loadAll(Business),
    loadAll(Product),
    loadAll(Service),
    loadAll(Review, { sinceDays: HISTORY_DAYS }),
    loadAll(Order, { sinceDays: HISTORY_DAYS }),
    loadAll(Booking, { sinceDays: HISTORY_DAYS }),
    loadAll(ActivityEvent, { sinceDays: HISTORY_DAYS }),
    loadAll(User),
  ]);

  const nameById = new Map(allBusinesses.map((b) => [sid(b._id), b.name || 'a local business']));
  const cards = allBusinesses.filter(isLiveBusiness).map((b) => toCard(serializeBusiness(b)));
  const cardById = new Map(cards.map((card) => [card._id, card]));
  const productById = new Map(products.map((p) => [sid(p._id), p]));
  const actorSets = new Map();

  const priceBounds = new Map();
  const notePrice = (businessId, price) => {
    const value = Number(price);
    if (!cardById.has(businessId) || !Number.isFinite(value) || value <= 0) return;
    const bounds = priceBounds.get(businessId) || { min: value, max: value };
    bounds.min = Math.min(bounds.min, value);
    bounds.max = Math.max(bounds.max, value);
    priceBounds.set(businessId, bounds);
  };
  products.filter((p) => p.availability !== false).forEach((p) => {
    notePrice(sid(p.businessId), Number(p.price) * (1 - (Number(p.discount) || 0) / 100));
  });
  services.filter((s) => s.availability !== false).forEach((s) => notePrice(sid(s.businessId), s.price));

  for (const order of orders) {
    const card = cardById.get(sid(order.businessId));
    if (order.status === 'cancelled') continue;
    if (card) {
      if (ageMs(order, now) <= 7 * DAY_MS) card.stats.orders7 += 1;
      if (ageMs(order, now) <= 30 * DAY_MS) card.stats.orders30 += 1;
    }
    addToActorSet(actorSets, `user:${sid(order.customerId)}`, sid(order.businessId));
  }
  for (const booking of bookings) {
    const card = cardById.get(sid(booking.businessId));
    if (['cancelled', 'rejected'].includes(booking.status)) continue;
    if (card) {
      if (ageMs(booking, now) <= 7 * DAY_MS) card.stats.bookings7 += 1;
      if (ageMs(booking, now) <= 30 * DAY_MS) card.stats.bookings30 += 1;
    }
    addToActorSet(actorSets, `user:${sid(booking.customerId)}`, sid(booking.businessId));
  }
  for (const review of reviews) {
    const card = cardById.get(sid(review.businessId));
    if (card && ageMs(review, now) <= 14 * DAY_MS) card.stats.reviews14 += 1;
    if (Number(review.rating) >= 3) addToActorSet(actorSets, `user:${sid(review.customerId)}`, sid(review.businessId));
  }
  for (const event of events) {
    const businessId = sid(event.businessId) || sid(productById.get(sid(event.productId))?.businessId);
    const card = cardById.get(businessId);
    if (card && event.type !== 'wishlist_add') {
      if (ageMs(event, now) <= 7 * DAY_MS) card.stats.views7 += 1;
      if (ageMs(event, now) <= 14 * DAY_MS) card.stats.views14 += 1;
    }
    if (card && event.type === 'wishlist_add' && ageMs(event, now) <= 7 * DAY_MS) card.stats.wishlist7 += 1;
    addToActorSet(actorSets, eventActor(event), businessId);
  }
  for (const user of users) {
    const saved = (user.wishlist?.businesses || []).map((item) => sid(item?._id || item?.id || item));
    saved.forEach((businessId) => {
      const card = cardById.get(businessId);
      if (card) card.stats.wishlistCount += 1;
      addToActorSet(actorSets, `user:${sid(user._id)}`, businessId);
    });
  }

  for (const card of cards) {
    const bounds = priceBounds.get(card._id);
    card.priceRange = bounds ? { min: roundMoney(bounds.min), max: roundMoney(bounds.max) } : null;
    const s = card.stats;
    card.popularity = s.orders30 * 3 + s.bookings30 * 3 + s.wishlistCount * 2 + s.views14 * 0.5
      + card.reviewCount * 1.5 + Math.max(0, bayesRating(card) - 3) * 2;
  }

  const deals = products
    .filter((p) => cardById.has(sid(p.businessId)) && Number(p.discount) > 0 && p.availability !== false
      && !(p.stock !== undefined && p.stock !== null && Number(p.stock) <= 0))
    .map((p) => {
      const discount = Math.min(100, Number(p.discount));
      return {
        _id: sid(p._id),
        name: p.name,
        category: p.category || '',
        image: (Array.isArray(p.images) && p.images[0]) || p.imageUrl || '',
        price: roundMoney(p.price),
        discount,
        finalPrice: roundMoney(Number(p.price) * (1 - discount / 100)),
        businessId: sid(p.businessId),
        businessName: cardById.get(sid(p.businessId)).name,
      };
    })
    .sort((a, b) => b.discount - a.discount || cardById.get(b.businessId).popularity - cardById.get(a.businessId).popularity)
    .slice(0, 12);

  return { cards, cardById, nameById, productById, actorSets, deals };
}

let baseCache = null;

function getBase(deps) {
  if (baseCache && Date.now() - baseCache.at < BASE_TTL_MS) return baseCache.promise;
  const promise = buildBase(deps).catch((err) => {
    baseCache = null;
    throw err;
  });
  baseCache = { at: Date.now(), promise };
  return promise;
}

function invalidateHomeCache() {
  baseCache = null;
}

/** GPS beats a typed area, which beats the saved address, the last delivery location, then Kathmandu. */
function resolveReferencePlace({ lat, lng, area, user, orders }) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180 && (latNum || lngNum)) {
    const near = Object.entries(CITY_CENTERS)
      .map(([city, [cLat, cLng]]) => ({ city, d: distanceKm(latNum, lngNum, cLat, cLng) }))
      .sort((a, b) => a.d - b.d)[0];
    const label = near && near.d <= 20 ? near.city.replace(/\b\w/g, (c) => c.toUpperCase()) : 'your location';
    return { label, city: label, lat: latNum, lng: lngNum, source: 'gps' };
  }
  const typed = resolvePlace(area);
  if (typed) return { ...typed, source: 'area' };
  for (const address of user?.addresses || []) {
    const place = resolvePlace(`${address?.address || ''} ${address?.city || ''} ${address?.location || ''}`);
    if (place) return { ...place, source: 'profile' };
  }
  const lastOrder = [...(orders || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  const fromOrder = resolvePlace(`${lastOrder?.deliveryAddress?.address || ''} ${lastOrder?.deliveryAddress?.location || ''}`);
  if (fromOrder) return { ...fromOrder, source: 'orders' };
  return { ...DEFAULT_PLACE, source: 'default' };
}

async function loadUserHistory(userId, visitorId) {
  const since = Date.now() - HISTORY_DAYS * DAY_MS;
  const recent = (docs) => docs.filter((doc) => new Date(doc.createdAt || 0).getTime() >= since);
  const [user, orders, bookings, reviews, userEvents, visitorEvents] = await Promise.all([
    userId ? User().findById(userId).then(plain).catch(() => null) : null,
    userId ? loadAll(Order, { filter: { customerId: userId } }) : [],
    userId ? loadAll(Booking, { filter: { customerId: userId } }) : [],
    userId ? loadAll(Review, { filter: { customerId: userId } }) : [],
    userId ? loadAll(ActivityEvent, { filter: { userId }, sinceDays: HISTORY_DAYS }) : [],
    visitorId ? loadAll(ActivityEvent, { filter: { visitorId }, sinceDays: HISTORY_DAYS }) : [],
  ]);
  const seen = new Set();
  const events = [...userEvents, ...visitorEvents].filter((event) => {
    const key = sid(event._id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { user, orders, bookings, reviews, events, recentOrders: recent(orders) };
}

function buildInteractions(history, base) {
  const interactions = [];
  history.orders.filter((o) => o.status !== 'cancelled')
    .forEach((o) => interactions.push({ kind: 'order', businessId: sid(o.businessId), at: o.createdAt }));
  history.bookings.filter((b) => !['cancelled', 'rejected'].includes(b.status))
    .forEach((b) => interactions.push({ kind: 'booking', businessId: sid(b.businessId), at: b.createdAt }));
  history.reviews.forEach((r) => interactions.push({ kind: 'review', businessId: sid(r.businessId), rating: r.rating, at: r.createdAt }));
  (history.user?.wishlist?.businesses || []).forEach((item) => {
    interactions.push({ kind: 'wishlist', businessId: sid(item?._id || item?.id || item) });
  });
  history.events.filter((e) => e.type !== 'wishlist_add').forEach((e) => {
    const businessId = sid(e.businessId) || sid(base.productById.get(sid(e.productId))?.businessId);
    interactions.push({ kind: 'view', businessId, at: e.createdAt });
  });
  return interactions.filter((item) => item.businessId);
}

function buildActivity(history, base) {
  const nameOf = (id) => base.nameById.get(sid(id)) || 'a local business';
  const items = [
    ...history.orders.map((o) => ({
      id: `order:${o._id}`,
      type: 'order',
      title: o.status === 'cancelled' ? 'Your order was cancelled' : 'You placed an order',
      subtitle: nameOf(o.businessId),
      businessId: sid(o.businessId),
      at: o.createdAt,
    })),
    ...history.bookings.map((b) => ({
      id: `booking:${b._id}`,
      type: 'booking',
      title: 'You booked a service',
      subtitle: [b.serviceName, b.businessName || nameOf(b.businessId)].filter(Boolean).join(' · '),
      businessId: sid(b.businessId),
      at: b.createdAt,
    })),
    ...history.reviews.map((r) => ({
      id: `review:${r._id}`,
      type: 'review',
      title: 'You left a review',
      subtitle: `${nameOf(r.businessId)} · ${Number(r.rating) || 0}★`,
      businessId: sid(r.businessId),
      at: r.createdAt,
    })),
    ...history.events.filter((e) => e.type === 'wishlist_add' && e.userId).map((e) => ({
      id: `wishlist:${e._id}`,
      type: 'wishlist',
      title: 'You added to wishlist',
      subtitle: nameOf(e.businessId),
      businessId: sid(e.businessId),
      at: e.createdAt,
    })),
  ];
  return items
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6);
}

async function buildHomeFeed({ user, visitorId, lat, lng, area }, deps) {
  const base = await getBase(deps);
  const userId = sid(user?.id || user?.userId);
  const history = await loadUserHistory(userId, visitorId);
  const place = resolveReferencePlace({ lat, lng, area, user: history.user, orders: history.orders });

  const cards = base.cards.map((card) => ({
    ...card,
    distanceKm: distanceKm(place.lat, place.lng, card.latitude, card.longitude),
  }));
  const cardById = new Map(cards.map((card) => [card._id, card]));

  const interactions = buildInteractions(history, base);
  const profile = buildUserProfile(interactions, cardById);
  const ownActors = new Set([userId && `user:${userId}`, visitorId && `visitor:${visitorId}`].filter(Boolean));
  const seeds = new Set([...profile.perBusiness.entries()].filter(([, entry]) => entry.score > 0).map(([id]) => id));

  const recommendations = {
    forYou: recommendForYou(cards, profile, { userId }),
    nearYou: recommendNearby(cards, place),
    alsoViewed: recommendAlsoViewed(cards, { seeds, actorSets: base.actorSets, ownActors, cardById }),
    trending: recommendTrending(cards, place),
    newLocal: recommendNewLocal(cards, { userId }),
  };

  const byPopularity = [...cards].sort((a, b) => b.popularity - a.popularity || bayesRating(b) - bayesRating(a));
  const featured = [...byPopularity.filter((card) => card.imageUrl), ...byPopularity.filter((card) => !card.imageUrl)].slice(0, 5);

  const savedCount = (history.user?.wishlist?.businesses || []).length;
  return {
    generatedAt: new Date().toISOString(),
    personalized: profile.categoryAffinity.size > 0,
    signals: {
      orders: history.orders.length,
      bookings: history.bookings.length,
      reviews: history.reviews.length,
      saved: savedCount,
      views: history.events.filter((e) => e.type !== 'wishlist_add').length,
    },
    location: { label: place.label, city: place.city, source: place.source },
    featured,
    highlights: pickHighlights(recommendations),
    recommendations,
    deals: { endsAt: nextNepalMidnight(), items: base.deals },
    popular: byPopularity.slice(0, 24),
    activity: userId ? buildActivity(history, base) : [],
  };
}

async function pruneMockEvents(model) {
  if (getIsMongo() || typeof model._read !== 'function') return;
  const data = model._read();
  if (data.length <= MOCK_EVENT_LIMIT) return;
  data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  model._write(data.slice(0, MOCK_EVENT_LIMIT));
}

/**
 * Stores a behaviour signal. Repeated views of the same page within 30 minutes count once,
 * and each visitor is capped per day so refresh loops cannot inflate "trending".
 */
async function recordActivity({ type, userId = '', visitorId = '', businessId = '', productId = '' }) {
  const model = ActivityEvent();
  const actorFilter = userId ? { userId: sid(userId) } : visitorId ? { visitorId: sid(visitorId) } : null;
  if (!model || !actorFilter) return { recorded: false };

  const now = Date.now();
  const recent = await loadAll(ActivityEvent, { filter: actorFilter, sinceDays: 1 });
  if (recent.length >= MAX_EVENTS_PER_ACTOR_PER_DAY) return { recorded: false, reason: 'limit' };
  if (type !== 'wishlist_add') {
    const duplicate = recent.some((event) => event.type === type
      && sid(event.businessId) === sid(businessId)
      && sid(event.productId) === sid(productId)
      && now - new Date(event.createdAt || 0).getTime() < VIEW_DEDUPE_MS);
    if (duplicate) return { recorded: false, reason: 'duplicate' };
  }

  await model.create({ type, userId: sid(userId), visitorId: sid(visitorId), businessId: sid(businessId), productId: sid(productId) });
  pruneMockEvents(model).catch(() => {});
  return { recorded: true };
}

module.exports = {
  buildHomeFeed,
  recordActivity,
  invalidateHomeCache,
  resolveReferencePlace,
  nextNepalMidnight,
  distanceKm,
};
