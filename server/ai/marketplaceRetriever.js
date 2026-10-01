const { categoryGroupsOf, CATEGORY_GROUPS } = require('../home/catalog');
const { isBusinessOpenNow, normalizeOpeningDays } = require('../utils/businessHours');
const { keywordsOf, tokenize, stem, expandWord, wordsMatch } = require('./queryParser');

// phone and contactEmail are public on the business profile; they are only returned when someone asks how to contact a business.
const BUSINESS_FIELDS = 'ownerId name category subcategory location description imageUrl coverUrl latitude longitude verified approvalStatus '
  + 'rating reviewCount hours openingDays manualOpenOverride manualOverrideAt deliveryAvailable deliveryRadiusKm offeringType createdAt '
  + 'phone contactEmail isVerified visitorsCount';
const PRODUCT_FIELDS = 'businessId name category subcategory description price discount stock brand images availability createdAt';
const SERVICE_FIELDS = 'businessId name description price duration availability homeService imageUrl images createdAt';
const INACTIVE_STATUSES = ['cancelled', 'rejected'];
const ITEM_RANK_SORTS = new Set(['price', 'price_desc', 'discount', 'newest', 'popular', 'reviews', 'rating']);
const METRIC_SORTS = new Set(['rating', 'reviews', 'popular']);

const CATEGORY_WORDS = new Set(CATEGORY_GROUPS.flatMap((group) => group.keywords.flatMap((word) => keywordsOf(word))));

const sid = (value) => String(value ?? '').trim();
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const firstImage = (doc) => {
  const images = Array.isArray(doc?.images) ? doc.images : [];
  const first = images.find(Boolean);
  const url = typeof first === 'string' ? first : first?.url || first?.secure_url || '';
  return url || doc?.imageUrl || '';
};

/** Product price after its own percentage discount, matching checkout. */
const productFinalPrice = (product) => {
  const price = Number(product.price) || 0;
  return roundMoney(price - (price * (Number(product.discount) || 0)) / 100);
};
const isProductAvailable = (product) => product.availability !== false && Number(product.stock) > 0;
const isServiceAvailable = (service) => service.availability !== false;
const isVerifiedBusiness = (business) => business.isVerified === true || ['verified', 'approved'].includes(business.verified);
const timeOf = (value) => new Date(value || 0).getTime() || 0;

function distanceKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((value) => value !== null && value !== '' && Number.isFinite(Number(value)))) return null;
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

async function findDocs(modelFactory, { getIsMongo, filter = {}, fields, mongoFilter }) {
  const model = typeof modelFactory === 'function' ? modelFactory() : null;
  // A missing model means the database is not ready; failing beats answering "nothing found".
  if (!model) throw new Error('Database model unavailable.');
  if (getIsMongo()) {
    let query = model.find(mongoFilter || filter);
    if (fields && typeof query.select === 'function') query = query.select(fields);
    return (typeof query.lean === 'function' ? await query.lean() : await query).map(plain);
  }
  return (await model.find(filter)).map(plain);
}

/** Adds `weight` for each search word (or one of its aliases) found in the field. */
function fieldScore(words, text, weight) {
  if (!text || !words.length) return 0;
  const fieldWords = keywordsOf(text);
  if (!fieldWords.length) return 0;
  return words.reduce((score, word) => score
    + (expandWord(word).some((alt) => fieldWords.some((candidate) => wordsMatch(alt, candidate))) ? weight : 0), 0);
}

const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "10:00 - 21:00, Sun to Fri" in plain words. */
function businessHoursText(business) {
  const days = normalizeOpeningDays(business?.openingDays);
  let dayText = 'every day';
  if (days.length < 7) {
    const sorted = WEEK.filter((day) => days.includes(day));
    const start = WEEK.indexOf(sorted[0]);
    const consecutive = sorted.every((day, index) => WEEK.indexOf(day) === start + index);
    dayText = consecutive && sorted.length > 2
      ? `${DAY_LABELS[sorted[0]]} to ${DAY_LABELS[sorted[sorted.length - 1]]}`
      : sorted.map((day) => DAY_LABELS[day]).join(', ');
  }
  const hours = String(business?.hours || '').trim();
  return hours ? `${hours}, ${dayText}` : `Open ${dayText}`;
}

const NAME_FILLER = new Set(['the', 'and', 'pvt', 'ltd', 'private', 'limited', 'co']);
const GENERIC_NAME_WORDS = new Set(['shop', 'store', 'pasal', 'corner', 'house', 'center', 'centre', 'mart', 'hub', 'point', 'trader',
  'enterprise', 'supplier', 'service', 'suppliers', 'traders', 'enterprises', 'services', 'nepal', 'nepali', 'kathmandu', 'himalayan',
  'hamro', 'new', 'local', 'best', 'everest', 'shree', 'shri', 'royal', 'golden', 'city', 'valley']);
const nameWordsOf = (name) => [...new Set(tokenize(name).filter((word) => word.length > 1 && !NAME_FILLER.has(word)).map(stem))];

/**
 * Finds a live business the question names, e.g. "is bhoj garden open?" or "himalayan spice contact".
 * Every distinctive word of the name must appear; generic words such as "corner" or a category may be left out.
 */
function matchBusinessByName(text, businesses) {
  const lower = String(text || '').toLowerCase();
  const queryWords = tokenize(lower).map(stem);
  let best = null;
  businesses.forEach((business) => {
    const name = String(business.name || '').toLowerCase().trim();
    const words = nameWordsOf(name);
    if (!name || !words.length) return;
    const matched = words.filter((word) => queryWords.some((query) => query === word || (word.length >= 5 && query.length >= 5 && wordsMatch(query, word))));
    const missing = words.filter((word) => !matched.includes(word));
    const distinctive = matched.filter((word) => word.length >= 4 && !GENERIC_NAME_WORDS.has(word) && !CATEGORY_WORDS.has(word));
    const fullName = name.length >= 4 && lower.includes(name);
    const onlyGenericMissing = missing.every((word) => GENERIC_NAME_WORDS.has(word) || CATEGORY_WORDS.has(word));
    const ok = fullName || (onlyGenericMissing && (
      (matched.length >= 2 && matched.some((word) => !GENERIC_NAME_WORDS.has(word)))
      || (distinctive.length > 0 && (words.length === 1 || distinctive[0].length >= 6))
    ));
    if (!ok) return;
    const score = (fullName ? 100 : 0) + matched.length * 10 - missing.length;
    if (!best || score > best.score) best = { business, score };
  });
  return best?.business || null;
}

/** Average rating and review count of each reviewed product or service. */
async function loadItemReviews({ models, getIsMongo, liveIds }) {
  if (!models.Review) return new Map();
  const reviews = await findDocs(models.Review, {
    getIsMongo,
    fields: 'targetId targetType rating businessId',
    mongoFilter: { businessId: { $in: liveIds }, targetType: { $in: ['product', 'service'] } },
  });
  const totals = new Map();
  reviews.forEach((review) => {
    const rating = Number(review.rating);
    if ((review.targetType !== 'product' && review.targetType !== 'service') || !Number.isFinite(rating)) return;
    const entry = totals.get(sid(review.targetId)) || { sum: 0, count: 0 };
    entry.sum += rating;
    entry.count += 1;
    totals.set(sid(review.targetId), entry);
  });
  return new Map([...totals].map(([id, { sum, count }]) => [id, { rating: Math.round((sum / count) * 10) / 10, count }]));
}

/** Units sold per product, bookings per service, and orders plus bookings per business. Only counts leave this function. */
async function loadPopularity({ models, getIsMongo, liveIds }) {
  const mongoFilter = { businessId: { $in: liveIds }, status: { $nin: INACTIVE_STATUSES } };
  const [orders, bookings] = await Promise.all([
    models.Order ? findDocs(models.Order, { getIsMongo, fields: 'businessId items status', mongoFilter }) : [],
    models.Booking ? findDocs(models.Booking, { getIsMongo, fields: 'businessId serviceId status', mongoFilter }) : [],
  ]);
  const items = new Map();
  const businesses = new Map();
  const add = (map, id, amount) => { if (id) map.set(id, (map.get(id) || 0) + amount); };
  orders.filter((order) => !INACTIVE_STATUSES.includes(order.status)).forEach((order) => {
    add(businesses, sid(order.businessId), 1);
    (Array.isArray(order.items) ? order.items : []).forEach((item) => {
      add(items, sid(item?.id || item?.productId || item?.serviceId || item?._id), Math.max(1, Math.round(Number(item?.quantity) || 1)));
    });
  });
  bookings.filter((booking) => !INACTIVE_STATUSES.includes(booking.status)).forEach((booking) => {
    add(businesses, sid(booking.businessId), 1);
    add(items, sid(booking.serviceId), 1);
  });
  return { items, businesses };
}

async function loadLiveBusinesses({ models, getIsMongo, isLiveBusiness }) {
  const all = await findDocs(models.Business, { getIsMongo, fields: BUSINESS_FIELDS });
  return all.filter((business) => isLiveBusiness(business));
}

function itemScore(item, words, conceptWords) {
  return fieldScore(words, item.name, 5)
    + fieldScore(conceptWords, item.name, 4)
    + fieldScore(words, `${item.category || ''} ${item.subcategory || ''} ${item.brand || ''}`, 3)
    + fieldScore(conceptWords, `${item.category || ''} ${item.subcategory || ''}`, 2)
    + fieldScore(words, item.description, 1);
}

function businessCard(business, extra = {}) {
  const reviewCount = Number(business.reviewCount) || 0;
  return {
    id: sid(business._id),
    name: business.name || 'Local business',
    category: business.category || '',
    subcategory: business.subcategory || '',
    location: business.location || '',
    imageUrl: business.imageUrl || business.logoUrl || business.coverUrl || '',
    verified: true,
    rating: reviewCount > 0 ? Math.round((Number(business.rating) || 0) * 10) / 10 : 0,
    reviewCount,
    offeringType: business.offeringType || 'both',
    deliveryAvailable: business.deliveryAvailable !== false,
    ...extra,
  };
}

/**
 * Searches live marketplace data for a parsed question. Everything comes straight from the database on each
 * request, so prices, stock and open status are never stale. Only approved businesses are ever considered.
 */
async function retrieveMarketplace(parsed, {
  models,
  getIsMongo,
  isLiveBusiness,
  origin = null,
  radiusKm = null,
  limit = 6,
  now = new Date(),
  businesses: preloaded = null,
  restrictBusinessId = null,
  browseAll = false,
} = {}) {
  const loaded = preloaded || await loadLiveBusinesses({ models, getIsMongo, isLiveBusiness });
  const live = loaded.filter((business) => isLiveBusiness(business)
    && (!restrictBusinessId || sid(business._id) === sid(restrictBusinessId)));
  const liveIds = live.map((business) => sid(business._id));
  const idFilter = { businessId: { $in: liveIds } };
  const [allProducts, allServices] = liveIds.length
    ? await Promise.all([
      findDocs(models.Product, { getIsMongo, fields: PRODUCT_FIELDS, mongoFilter: idFilter }),
      findDocs(models.Service, { getIsMongo, fields: SERVICE_FIELDS, mongoFilter: idFilter }),
    ])
    : [[], []];

  const liveSet = new Set(liveIds);
  const products = allProducts.filter((product) => liveSet.has(sid(product.businessId)));
  const services = allServices.filter((service) => liveSet.has(sid(service.businessId)));

  const sort = parsed.sort || null;
  const needsReviews = sort === 'rating' || sort === 'reviews' || Boolean(parsed.minRating);
  const [reviewStats, popularity] = await Promise.all([
    needsReviews && liveIds.length ? loadItemReviews({ models, getIsMongo, liveIds }) : new Map(),
    sort === 'popular' && liveIds.length ? loadPopularity({ models, getIsMongo, liveIds }) : null,
  ]);
  const reviewsOf = (item) => reviewStats.get(sid(item._id)) || null;
  const soldOf = (item) => popularity?.items.get(sid(item._id)) || 0;

  const enforceRadius = Boolean(!restrictBusinessId && origin && radiusKm && (parsed.nearMe || parsed.radiusKm));
  const businessInfo = new Map();
  live.forEach((business) => {
    const id = sid(business._id);
    const distance = origin ? distanceKm(origin.lat, origin.lng, business.latitude, business.longitude) : null;
    const offering = business.offeringType || 'both';
    businessInfo.set(id, {
      business,
      distance,
      isOpen: isBusinessOpenNow(business, now),
      groups: categoryGroupsOf(business),
      sellsProducts: offering !== 'services',
      sellsServices: offering !== 'products',
    });
  });

  const eligible = (id) => {
    const info = businessInfo.get(id);
    if (!info) return false;
    if (enforceRadius && (info.distance === null || info.distance > radiusKm)) return false;
    if (parsed.openNow && !info.isOpen) return false;
    if (parsed.closedNow && info.isOpen) return false;
    if (parsed.wantsDelivery && (info.business.deliveryAvailable === false || !info.sellsProducts)) return false;
    if (parsed.verifiedOnly && !isVerifiedBusiness(info.business)) return false;
    return true;
  };

  const words = parsed.keywords || [];
  const conceptWords = keywordsOf((parsed.conceptTerms || []).join(' '));
  const specificWords = words.filter((word) => !CATEGORY_WORDS.has(word) && !conceptWords.includes(word));
  // Words naming a particular item ("iphone", "haircut", or free text with no known category) must match a listing,
  // otherwise the answer says it couldn't be found instead of pretending related shops are a match.
  const itemWords = [...new Set([
    ...conceptWords.filter((word) => !CATEGORY_WORDS.has(word)),
    ...((parsed.groups || []).length ? [] : specificWords),
  ])];
  const wantsGroups = new Set(parsed.groups || []);
  const priceFilter = parsed.minPrice !== null || parsed.maxPrice !== null;
  const inPriceRange = (price) => (parsed.minPrice === null || price >= parsed.minPrice) && (parsed.maxPrice === null || price <= parsed.maxPrice);
  const hasTextQuery = words.length > 0 || conceptWords.length > 0;
  const groupBoost = (id) => (businessInfo.get(id)?.groups.some((group) => wantsGroups.has(group)) ? 2 : 0);

  const scoreItems = (list, type) => list
    .filter((item) => eligible(sid(item.businessId)))
    .filter((item) => (type === 'product' ? businessInfo.get(sid(item.businessId)).sellsProducts : businessInfo.get(sid(item.businessId)).sellsServices))
    .map((item) => {
      const businessId = sid(item.businessId);
      const text = itemScore(item, words, conceptWords);
      const price = type === 'product' ? productFinalPrice(item) : roundMoney(item.price);
      return { item, type, businessId, text, score: text + (text > 0 ? groupBoost(businessId) : 0), price };
    });

  // "Cheapest groceries" or "best offers" from businesses are decided by the price or discount of what they sell.
  const businessByItem = parsed.kind === 'business' && ['price', 'price_desc', 'discount'].includes(sort);
  // Ranking questions such as "most expensive products" or "what's trending" compare listings, not shops.
  const itemRanking = Boolean(ITEM_RANK_SORTS.has(sort) || parsed.minDiscount) && (
    parsed.kind === 'product' || parsed.kind === 'service'
    || (parsed.kind === 'any' && sort !== 'rating' && sort !== 'reviews' && (!hasTextQuery || sort === 'discount' || sort === 'price' || sort === 'price_desc')));
  const wantProducts = parsed.kind === 'product' || parsed.kind === 'any' || businessByItem;
  const wantServices = parsed.kind === 'service' || parsed.kind === 'any';
  let productHits = wantProducts ? scoreItems(products, 'product') : [];
  let serviceHits = wantServices ? scoreItems(services, 'service') : [];

  // Without search words (e.g. "services near me" or "under NPR 500") every item passing the filters is a candidate.
  const browseItems = browseAll || priceFilter || parsed.kind === 'product' || parsed.kind === 'service' || itemRanking || businessByItem;
  const itemMatches = (hit) => (hasTextQuery ? hit.text > 0 : browseItems) && (!priceFilter || inPriceRange(hit.price));
  const namesItem = (hit) => fieldScore(itemWords, `${hit.item.name} ${hit.item.category || ''} ${hit.item.subcategory || ''} ${hit.item.brand || ''}`, 1) > 0;
  const unavailable = itemWords.length ? productHits.filter((hit) => namesItem(hit) && !isProductAvailable(hit.item)) : [];
  // When the best match names the item, drop hits that only matched a word in their description.
  const dropWeak = (hits) => {
    const best = hits.reduce((max, hit) => Math.max(max, hit.text), 0);
    return best >= 4 ? hits.filter((hit) => hit.text >= Math.min(4, best / 2)) : hits;
  };
  productHits = dropWeak(productHits.filter((hit) => itemMatches(hit) && isProductAvailable(hit.item)));
  serviceHits = dropWeak(serviceHits.filter((hit) => itemMatches(hit) && isServiceAvailable(hit.item)));

  // Discounts and minimum ratings are what the customer asked for, so items without them are left out.
  const discountOf = (hit) => (hit.type === 'product' ? Number(hit.item.discount) || 0 : 0);
  const keepItem = (hit) => (sort !== 'discount' || discountOf(hit) >= Math.max(1, parsed.minDiscount || 0))
    && (!parsed.minRating || parsed.kind === 'business' || (reviewsOf(hit.item)?.rating || 0) >= parsed.minRating);
  productHits = productHits.filter(keepItem);
  serviceHits = serviceHits.filter(keepItem);

  const itemMetric = (hit) => {
    if (sort === 'rating') return reviewsOf(hit.item)?.rating || 0;
    if (sort === 'reviews') return reviewsOf(hit.item)?.count || 0;
    if (sort === 'popular') return soldOf(hit.item);
    return 0;
  };
  // Never call an item "highest rated" or "most popular" without reviews or orders behind it.
  let rankingMissing = false;
  if (itemRanking && METRIC_SORTS.has(sort)) {
    const ranked = [productHits.filter((hit) => itemMetric(hit) > 0), serviceHits.filter((hit) => itemMetric(hit) > 0)];
    if (ranked[0].length + ranked[1].length > 0) [productHits, serviceHits] = ranked;
    else rankingMissing = productHits.length + serviceHits.length > 0;
  }

  const namedText = (item) => `${item.name} ${item.category || ''} ${item.subcategory || ''} ${item.brand || ''}`;
  const existsBeyondFilters = itemWords.length > 0 && (enforceRadius || parsed.openNow)
    && [...products.filter(isProductAvailable), ...services.filter(isServiceAvailable)].some((item) => fieldScore(itemWords, namedText(item), 1) > 0);
  const itemFound = !itemWords.length
    || [...productHits, ...serviceHits].some(namesItem)
    || live.some((business) => eligible(sid(business._id)) && fieldScore(itemWords, `${business.name} ${business.category || ''} ${business.subcategory || ''}`, 1) > 0);

  const betterItem = (hit, current) => {
    if (sort === 'discount' && discountOf(hit) !== discountOf(current)) return discountOf(hit) > discountOf(current);
    if (sort === 'price_desc' && hit.price !== current.price) return hit.price > current.price;
    if (sort === 'price' && hit.price !== current.price) return hit.price < current.price;
    return hit.score > current.score || (hit.score === current.score && hit.price < current.price);
  };
  const bestItemByBusiness = new Map();
  [...productHits, ...serviceHits].forEach((hit) => {
    const current = bestItemByBusiness.get(hit.businessId);
    if (!current || betterItem(hit, current)) bestItemByBusiness.set(hit.businessId, hit);
  });

  const rating = (business) => (Number(business.reviewCount) > 0 ? Number(business.rating) || 0 : 0);
  const businessHits = [];
  businessInfo.forEach((info, id) => {
    if (!eligible(id)) return;
    if (parsed.kind === 'product' && !info.sellsProducts) return;
    if (parsed.kind === 'service' && !info.sellsServices) return;
    const { business } = info;
    const bestItem = bestItemByBusiness.get(id) || null;
    const groupMatch = info.groups.some((group) => wantsGroups.has(group));
    let score = fieldScore(words, business.name, 4)
      + fieldScore(words, `${business.category || ''} ${business.subcategory || ''}`, 3)
      + fieldScore(words, business.description, 1)
      + (groupMatch ? 5 : 0)
      + (bestItem ? Math.min(bestItem.score, 8) : 0);
    if (priceFilter && !bestItem) return;
    if ((businessByItem || (!hasTextQuery && browseItems)) && !bestItem) return;
    if (parsed.minRating && !itemRanking && rating(business) < parsed.minRating) return;
    if (!hasTextQuery) score = Math.max(score, 1);
    if (score <= 0) return;
    businessHits.push({ id, info, score, bestItem });
  });

  const sortKey = sort || (parsed.nearMe ? 'distance' : 'relevance');
  const byDistance = (a, b) => (a ?? Infinity) - (b ?? Infinity);
  const reviewCount = (business) => Number(business.reviewCount) || 0;
  const ordersOf = (id) => popularity?.businesses.get(id) || 0;
  businessHits.sort((a, b) => {
    const [ba, bb] = [a.info.business, b.info.business];
    if (sortKey === 'distance') return byDistance(a.info.distance, b.info.distance) || b.score - a.score;
    if (sortKey === 'rating') return rating(bb) - rating(ba) || reviewCount(bb) - reviewCount(ba) || b.score - a.score;
    if (sortKey === 'reviews') return reviewCount(bb) - reviewCount(ba) || rating(bb) - rating(ba);
    if (sortKey === 'popular') return ordersOf(b.id) - ordersOf(a.id) || (Number(bb.visitorsCount) || 0) - (Number(ba.visitorsCount) || 0) || reviewCount(bb) - reviewCount(ba);
    if (sortKey === 'newest') return timeOf(bb.createdAt) - timeOf(ba.createdAt);
    if (sortKey === 'discount') return (b.bestItem ? discountOf(b.bestItem) : 0) - (a.bestItem ? discountOf(a.bestItem) : 0) || b.score - a.score;
    if (sortKey === 'price') return (a.bestItem?.price ?? Infinity) - (b.bestItem?.price ?? Infinity) || b.score - a.score;
    if (sortKey === 'price_desc') return (b.bestItem?.price ?? -Infinity) - (a.bestItem?.price ?? -Infinity) || b.score - a.score;
    return b.score - a.score
      || (Number(b.info.isOpen) - Number(a.info.isOpen))
      || rating(bb) - rating(ba)
      || byDistance(a.info.distance, b.info.distance);
  });

  // With no reviews or orders to rank by, the newest listings are shown and the answer says so.
  const itemSort = rankingMissing ? 'newest' : sortKey;
  const sortItems = (hits) => hits.sort((a, b) => {
    const da = businessInfo.get(a.businessId)?.distance;
    const db = businessInfo.get(b.businessId)?.distance;
    if (itemSort === 'price') return a.price - b.price || b.score - a.score;
    if (itemSort === 'price_desc') return b.price - a.price || b.score - a.score;
    if (itemSort === 'discount') return discountOf(b) - discountOf(a) || a.price - b.price;
    if (itemSort === 'rating') return itemMetric(b) - itemMetric(a) || (reviewsOf(b.item)?.count || 0) - (reviewsOf(a.item)?.count || 0);
    if (itemSort === 'reviews' || itemSort === 'popular') return itemMetric(b) - itemMetric(a) || b.score - a.score;
    if (itemSort === 'newest') return timeOf(b.item.createdAt) - timeOf(a.item.createdAt) || b.score - a.score;
    if (itemSort === 'distance') return byDistance(da, db) || b.score - a.score;
    return b.score - a.score || a.price - b.price || byDistance(da, db);
  });

  const businessNameOf = (id) => businessInfo.get(id)?.business?.name || '';
  const rankFacts = (item) => {
    const reviews = reviewsOf(item);
    return {
      ...(needsReviews ? { rating: reviews?.rating || 0, reviewCount: reviews?.count || 0 } : {}),
      ...(popularity ? { sold: soldOf(item) } : {}),
    };
  };
  const productCard = ({ item, businessId, price }) => {
    const info = businessInfo.get(businessId);
    return {
      id: sid(item._id),
      businessId,
      businessName: businessNameOf(businessId),
      name: item.name,
      category: item.category || '',
      brand: item.brand || '',
      price: roundMoney(item.price),
      discount: Number(item.discount) || 0,
      finalPrice: price,
      description: String(item.description || '').slice(0, 300),
      stock: Number(item.stock) || 0,
      inStock: isProductAvailable(item),
      imageUrl: firstImage(item),
      distanceKm: info?.distance ?? null,
      businessOpen: Boolean(info?.isOpen),
      ...rankFacts(item),
    };
  };
  const serviceCard = ({ item, businessId, price }) => {
    const info = businessInfo.get(businessId);
    return {
      id: sid(item._id),
      businessId,
      businessName: businessNameOf(businessId),
      name: item.name,
      price,
      description: String(item.description || '').slice(0, 300),
      durationMinutes: Number(item.duration) || null,
      homeService: Boolean(item.homeService),
      available: isServiceAvailable(item),
      imageUrl: firstImage(item),
      distanceKm: info?.distance ?? null,
      businessOpen: Boolean(info?.isOpen),
      ...rankFacts(item),
    };
  };

  const rawById = new Map([...products, ...services].map((item) => [sid(item._id), item]));
  /**
   * Up to `count` in-stock items like the seeds (same category, shared name words, same kind of shop), honouring the
   * same radius, open-now and price filters. With no seeds, items from the categories the question mentions.
   */
  const suggestSimilar = ({ type, seedIds = [], excludeIds = [], count = 2 }) => {
    if (count <= 0) return [];
    const seeds = seedIds.map((id) => rawById.get(sid(id))).filter(Boolean);
    const exclude = new Set([...excludeIds, ...seedIds].map(sid));
    const seedWords = [...new Set(seeds.flatMap((seed) => keywordsOf(seed.name)))];
    const seedCategories = new Set(seeds.flatMap((seed) => [seed.category, seed.subcategory]).filter(Boolean).map((value) => String(value).toLowerCase()));
    const seedGroups = new Set(seeds.length
      ? seeds.flatMap((seed) => businessInfo.get(sid(seed.businessId))?.groups || [])
      : [...wantsGroups]);
    const seedPrimary = new Set(seeds.length
      ? seeds.map((seed) => businessInfo.get(sid(seed.businessId))?.groups[0]).filter(Boolean)
      : [...wantsGroups]);
    if (!seeds.length && !seedGroups.size) return [];
    const pool = type === 'product' ? products.filter(isProductAvailable) : services.filter(isServiceAvailable);
    return pool
      .filter((item) => !exclude.has(sid(item._id)) && eligible(sid(item.businessId)))
      .filter((item) => (type === 'product' ? businessInfo.get(sid(item.businessId)).sellsProducts : businessInfo.get(sid(item.businessId)).sellsServices))
      .map((item) => {
        const businessId = sid(item.businessId);
        const info = businessInfo.get(businessId);
        const category = String(item.category || '').toLowerCase();
        const subcategory = String(item.subcategory || '').toLowerCase();
        const groupScore = seedPrimary.has(info.groups[0]) ? 2 : info.groups.some((group) => seedGroups.has(group)) ? 1 : 0;
        const score = fieldScore(seedWords, item.name, 3)
          + (subcategory && seedCategories.has(subcategory) ? 3 : 0)
          + (category && seedCategories.has(category) ? 2 : 0)
          + groupScore;
        const price = type === 'product' ? productFinalPrice(item) : roundMoney(item.price);
        return { item, type, businessId, text: 0, score, price };
      })
      .filter((hit) => hit.score >= 2 && (!priceFilter || inPriceRange(hit.price)))
      .sort((a, b) => b.score - a.score
        || byDistance(businessInfo.get(a.businessId)?.distance, businessInfo.get(b.businessId)?.distance)
        || a.price - b.price)
      .slice(0, count)
      .map(type === 'product' ? productCard : serviceCard);
  };

  const businesses = businessHits.slice(0, limit).map(({ id, info, bestItem }) => businessCard(info.business, {
    distanceKm: info.distance,
    isOpen: info.isOpen,
    hoursText: businessHoursText(info.business),
    topItem: bestItem ? {
      type: bestItem.type,
      id: sid(bestItem.item._id),
      name: bestItem.item.name,
      price: bestItem.price,
      discount: discountOf(bestItem),
    } : null,
    ...(popularity ? { orderCount: ordersOf(id), visitorsCount: Number(info.business.visitorsCount) || 0 } : {}),
    ...(sortKey === 'newest' ? { joinedAt: info.business.createdAt || null } : {}),
    ...(parsed.wantsDelivery ? { deliveryRadiusKm: Number(info.business.deliveryRadiusKm) || 5 } : {}),
    isVerified: isVerifiedBusiness(info.business),
    id,
  }));

  const sortedProducts = sortItems(productHits);
  const sortedServices = sortItems(serviceHits);
  return {
    businesses,
    products: sortedProducts.slice(0, limit).map(productCard),
    services: sortedServices.slice(0, limit).map(serviceCard),
    topScores: { product: sortedProducts[0]?.text || 0, service: sortedServices[0]?.text || 0 },
    suggestSimilar,
    unavailable: unavailable.slice(0, 3).map(productCard),
    notFound: !itemFound,
    existsBeyondFilters: !itemFound && existsBeyondFilters,
    itemWords,
    filters: {
      kind: parsed.kind,
      radiusKm: enforceRadius ? radiusKm : null,
      origin: origin ? { label: origin.label, source: origin.source } : null,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      openNow: parsed.openNow,
      closedNow: Boolean(parsed.closedNow),
      wantsDelivery: Boolean(parsed.wantsDelivery),
      verifiedOnly: Boolean(parsed.verifiedOnly),
      minRating: parsed.minRating || null,
      minDiscount: parsed.minDiscount || null,
      sort: sortKey,
      itemRanking,
    },
    rankingMissing,
    totals: { businesses: businessHits.length, products: productHits.length, services: serviceHits.length },
  };
}

module.exports = {
  retrieveMarketplace,
  loadLiveBusinesses,
  matchBusinessByName,
  businessHoursText,
  productFinalPrice,
  isProductAvailable,
  distanceKm,
  findDocs,
  businessCard,
};
