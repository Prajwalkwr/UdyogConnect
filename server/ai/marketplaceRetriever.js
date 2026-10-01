const { categoryGroupsOf, CATEGORY_GROUPS } = require('../home/catalog');
const { isBusinessOpenNow } = require('../utils/businessHours');
const { keywordsOf } = require('./queryParser');

const BUSINESS_FIELDS = 'ownerId name category subcategory location description imageUrl coverUrl latitude longitude verified approvalStatus '
  + 'rating reviewCount hours openingDays manualOpenOverride manualOverrideAt deliveryAvailable deliveryRadiusKm offeringType createdAt';
const PRODUCT_FIELDS = 'businessId name category subcategory description price discount stock brand images availability';
const SERVICE_FIELDS = 'businessId name description price duration availability homeService imageUrl images';

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

/** Same word, or a shared stem such as plumber/plumbing or haircut/hair. */
function wordsMatch(a, b) {
  if (a === b) return true;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  return common >= Math.max(4, Math.min(a.length, b.length) - 2);
}

/** Adds `weight` for each search word found in the field. */
function fieldScore(words, text, weight) {
  if (!text || !words.length) return 0;
  const fieldWords = keywordsOf(text);
  return words.reduce((score, word) => score + (fieldWords.some((candidate) => wordsMatch(word, candidate)) ? weight : 0), 0);
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
} = {}) {
  const allBusinesses = await findDocs(models.Business, { getIsMongo, fields: BUSINESS_FIELDS });
  const live = allBusinesses.filter((business) => isLiveBusiness(business));
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

  const enforceRadius = Boolean(origin && radiusKm && (parsed.nearMe || parsed.radiusKm));
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

  const wantProducts = parsed.kind === 'product' || parsed.kind === 'any';
  const wantServices = parsed.kind === 'service' || parsed.kind === 'any';
  let productHits = wantProducts ? scoreItems(products, 'product') : [];
  let serviceHits = wantServices ? scoreItems(services, 'service') : [];

  // Without search words (e.g. "services near me" or "under NPR 500") every item passing the filters is a candidate.
  const browseItems = priceFilter || parsed.kind === 'product' || parsed.kind === 'service';
  const itemMatches = (hit) => (hasTextQuery ? hit.text > 0 : browseItems) && (!priceFilter || inPriceRange(hit.price));
  const namesItem = (hit) => fieldScore(itemWords, `${hit.item.name} ${hit.item.category || ''} ${hit.item.subcategory || ''} ${hit.item.brand || ''}`, 1) > 0;
  const unavailable = itemWords.length ? productHits.filter((hit) => namesItem(hit) && !isProductAvailable(hit.item)) : [];
  productHits = productHits.filter((hit) => itemMatches(hit) && isProductAvailable(hit.item));
  serviceHits = serviceHits.filter((hit) => itemMatches(hit) && isServiceAvailable(hit.item));

  const namedText = (item) => `${item.name} ${item.category || ''} ${item.subcategory || ''} ${item.brand || ''}`;
  const existsBeyondFilters = itemWords.length > 0 && (enforceRadius || parsed.openNow)
    && [...products.filter(isProductAvailable), ...services.filter(isServiceAvailable)].some((item) => fieldScore(itemWords, namedText(item), 1) > 0);
  const itemFound = !itemWords.length
    || [...productHits, ...serviceHits].some(namesItem)
    || live.some((business) => eligible(sid(business._id)) && fieldScore(itemWords, `${business.name} ${business.category || ''} ${business.subcategory || ''}`, 1) > 0);

  const bestItemByBusiness = new Map();
  [...productHits, ...serviceHits].forEach((hit) => {
    const current = bestItemByBusiness.get(hit.businessId);
    if (!current || hit.score > current.score || (hit.score === current.score && hit.price < current.price)) bestItemByBusiness.set(hit.businessId, hit);
  });

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
    if (!hasTextQuery && browseItems && !bestItem) return;
    if (!hasTextQuery) score = Math.max(score, 1);
    if (score <= 0) return;
    businessHits.push({ id, info, score, bestItem });
  });

  const rating = (business) => (Number(business.reviewCount) > 0 ? Number(business.rating) || 0 : 0);
  const sortKey = parsed.sort || (parsed.nearMe ? 'distance' : 'relevance');
  const byDistance = (a, b) => (a ?? Infinity) - (b ?? Infinity);
  businessHits.sort((a, b) => {
    if (sortKey === 'distance') return byDistance(a.info.distance, b.info.distance) || b.score - a.score;
    if (sortKey === 'rating') return rating(b.info.business) - rating(a.info.business) || b.score - a.score;
    if (sortKey === 'price') return (a.bestItem?.price ?? Infinity) - (b.bestItem?.price ?? Infinity) || b.score - a.score;
    return b.score - a.score
      || (Number(b.info.isOpen) - Number(a.info.isOpen))
      || rating(b.info.business) - rating(a.info.business)
      || byDistance(a.info.distance, b.info.distance);
  });

  const sortItems = (hits) => hits.sort((a, b) => {
    const da = businessInfo.get(a.businessId)?.distance;
    const db = businessInfo.get(b.businessId)?.distance;
    if (sortKey === 'price') return a.price - b.price || b.score - a.score;
    if (sortKey === 'distance') return byDistance(da, db) || b.score - a.score;
    return b.score - a.score || a.price - b.price || byDistance(da, db);
  });

  const businessNameOf = (id) => businessInfo.get(id)?.business?.name || '';
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
      stock: Number(item.stock) || 0,
      inStock: isProductAvailable(item),
      imageUrl: firstImage(item),
      distanceKm: info?.distance ?? null,
      businessOpen: Boolean(info?.isOpen),
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
      durationMinutes: Number(item.duration) || null,
      homeService: Boolean(item.homeService),
      available: isServiceAvailable(item),
      imageUrl: firstImage(item),
      distanceKm: info?.distance ?? null,
      businessOpen: Boolean(info?.isOpen),
    };
  };

  const businesses = businessHits.slice(0, limit).map(({ id, info, bestItem }) => businessCard(info.business, {
    distanceKm: info.distance,
    isOpen: info.isOpen,
    topItem: bestItem ? {
      type: bestItem.type,
      id: sid(bestItem.item._id),
      name: bestItem.item.name,
      price: bestItem.price,
    } : null,
    id,
  }));

  return {
    businesses,
    products: sortItems(productHits).slice(0, limit).map(productCard),
    services: sortItems(serviceHits).slice(0, limit).map(serviceCard),
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
      sort: sortKey,
    },
    totals: { businesses: businessHits.length, products: productHits.length, services: serviceHits.length },
  };
}

module.exports = { retrieveMarketplace, productFinalPrice, isProductAvailable, distanceKm, findDocs, businessCard };
