/**
 * Recommendation scoring for the home page. Pure functions over live marketplace data:
 * no demo content, every suggestion is an approved business with a human-readable reason.
 */

const INTERACTION_WEIGHTS = { order: 5, booking: 4, wishlist: 4, review: 3, view: 1 };
const MAX_VIEWS_COUNTED = 3;
const AREA_RADIUS_KM = 25;

const REASON_BY_KIND = {
  order: (name) => `Because you ordered from ${name}`,
  booking: (name) => `Because you booked ${name}`,
  wishlist: (name) => `Because you saved ${name}`,
  review: (name) => `Because you enjoyed ${name}`,
  view: (name) => `Because you viewed ${name}`,
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Rating pulled towards 3.5 when a business has only a few reviews. */
function bayesRating(card) {
  const count = Number(card.reviewCount) || 0;
  const rating = count > 0 ? Number(card.rating) || 0 : 0;
  return (2 * 3.5 + rating * count) / (2 + count);
}

function fallbackReason(card) {
  if (card.reviewCount > 0) return `Rated ${Number(card.rating).toFixed(1)} by ${plural(card.reviewCount, 'customer')}`;
  if (card.stats.orders30 > 0) return `${plural(card.stats.orders30, 'order')} this month`;
  if (card.stats.views14 > 0) return `${plural(card.stats.views14, 'view')} in the last two weeks`;
  const joined = card.createdAt ? Date.now() - new Date(card.createdAt).getTime() : Infinity;
  if (joined < 30 * 24 * 60 * 60 * 1000) return 'New on UdyogConnect';
  return 'Verified local business';
}

/**
 * Summarises what the user did: which businesses they engaged with, and which categories
 * they seem to like (remembering the interaction that best explains each category).
 */
function buildUserProfile(interactions, cardById) {
  const perBusiness = new Map();
  const categoryAffinity = new Map();
  const groupAffinity = new Map();
  const disliked = new Set();

  for (const item of interactions) {
    const id = String(item.businessId || '');
    if (!id) continue;
    const entry = perBusiness.get(id) || { score: 0, views: 0, orders: 0, best: null };
    let weight = INTERACTION_WEIGHTS[item.kind] || 0;
    if (item.kind === 'view') {
      if (entry.views >= MAX_VIEWS_COUNTED) weight = 0;
      entry.views += 1;
    }
    if (item.kind === 'order') entry.orders += 1;
    if (item.kind === 'review' && Number(item.rating) <= 2) {
      disliked.add(id);
      weight = -INTERACTION_WEIGHTS.review;
    }
    entry.score += weight;
    if (weight > 0 && (!entry.best || weight > entry.best.weight)) entry.best = { kind: item.kind, weight };
    perBusiness.set(id, entry);
  }

  for (const [id, entry] of perBusiness) {
    const card = cardById.get(id);
    if (!card || entry.score <= 0) continue;
    const source = { businessId: id, name: card.name, kind: entry.best?.kind || 'view', weight: entry.score };
    const categoryKey = String(card.category || '').toLowerCase();
    if (categoryKey) {
      const current = categoryAffinity.get(categoryKey) || { score: 0, source };
      current.score += entry.score;
      if (entry.score > current.source.weight) current.source = source;
      categoryAffinity.set(categoryKey, current);
    }
    for (const group of card.groups) {
      const current = groupAffinity.get(group) || { score: 0, source };
      current.score += entry.score;
      if (entry.score > current.source.weight) current.source = source;
      groupAffinity.set(group, current);
    }
  }

  return { perBusiness, categoryAffinity, groupAffinity, disliked, signalCount: interactions.length };
}

function maxOf(values) {
  return values.reduce((max, value) => (value > max ? value : max), 0) || 1;
}

function recommendForYou(cards, profile, { userId = '', limit = 8 } = {}) {
  const candidates = cards.filter((card) => !profile.disliked.has(card._id) && (!userId || card.ownerId !== userId));
  const maxPopularity = maxOf(candidates.map((card) => card.popularity));

  if (!profile.categoryAffinity.size && !profile.groupAffinity.size) {
    return candidates
      .map((card) => ({ card, score: bayesRating(card) + (card.popularity / maxPopularity) * 1.5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ card }) => ({ ...card, reason: fallbackReason(card) }));
  }

  return candidates
    .map((card) => {
      const category = profile.categoryAffinity.get(String(card.category || '').toLowerCase());
      const groups = card.groups.map((group) => profile.groupAffinity.get(group)).filter(Boolean);
      const groupScore = groups.reduce((sum, entry) => sum + entry.score, 0);
      const own = profile.perBusiness.get(card._id);
      let score = (category?.score || 0) + groupScore * 0.6 + bayesRating(card) * 0.8 + (card.popularity / maxPopularity) * 1.5;
      if (card.distanceKm != null && card.distanceKm <= 5) score += 0.8;
      // Places the user already engages with are known to them; favour discovery.
      if (own && own.score > 0) score -= 3;

      const source = [category?.source, ...groups.map((entry) => entry.source)]
        .filter((entry) => entry && entry.businessId !== card._id)
        .sort((a, b) => b.weight - a.weight)[0];
      let reason = source ? REASON_BY_KIND[source.kind](source.name) : fallbackReason(card);
      if (!source && own?.orders) reason = 'You have ordered here before';
      else if (!source && own?.score > 0) reason = 'One of your favourites';
      return { card, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ card, reason }) => ({ ...card, reason }));
}

function recommendNearby(cards, place, { limit = 8 } = {}) {
  const located = cards.filter((card) => card.distanceKm != null);
  if (!located.length) {
    return [...cards]
      .sort((a, b) => bayesRating(b) - bayesRating(a))
      .slice(0, limit)
      .map((card) => ({ ...card, reason: card.location ? `Located in ${card.location}` : fallbackReason(card) }));
  }
  return located
    .sort((a, b) => a.distanceKm - b.distanceKm || bayesRating(b) - bayesRating(a))
    .slice(0, limit)
    .map((card) => ({
      ...card,
      reason: card.distanceKm < 0.5 ? `Right in ${place.label}` : `${card.distanceKm} km from ${place.label}`,
    }));
}

/**
 * Item-to-item co-occurrence: other shoppers who engaged with the same businesses as this
 * user, and what else they looked at. Falls back to what is being viewed most right now.
 */
function recommendAlsoViewed(cards, { seeds, actorSets, ownActors, cardById, limit = 8 }) {
  const scores = new Map();
  const via = new Map();

  if (seeds.size) {
    for (const [actor, set] of actorSets) {
      if (ownActors.has(actor) || set.size < 2) continue;
      const overlap = [...set].filter((id) => seeds.has(id));
      if (!overlap.length) continue;
      const weight = overlap.length / Math.sqrt(set.size);
      for (const id of set) {
        if (seeds.has(id) || !cardById.has(id)) continue;
        scores.set(id, (scores.get(id) || 0) + weight);
        const sources = via.get(id) || new Map();
        overlap.forEach((seed) => sources.set(seed, (sources.get(seed) || 0) + weight));
        via.set(id, sources);
      }
    }
  }

  const results = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => {
      const [seedId] = [...via.get(id).entries()].sort((a, b) => b[1] - a[1])[0];
      return { ...cardById.get(id), reason: `People interested in ${cardById.get(seedId)?.name || 'similar places'} also viewed this` };
    });

  const used = new Set(results.map((card) => card._id));
  const fill = cards
    .filter((card) => !used.has(card._id) && !seeds.has(card._id))
    .sort((a, b) => b.stats.views7 - a.stats.views7 || b.popularity - a.popularity)
    .map((card) => ({
      ...card,
      reason: card.stats.views7 > 0 ? `${plural(card.stats.views7, 'view')} this week` : fallbackReason(card),
    }));

  return [...results, ...fill].slice(0, limit);
}

function momentumOf(card) {
  const s = card.stats;
  return s.orders7 * 3 + s.bookings7 * 3 + s.reviews14 * 2 + s.wishlist7 * 2 + s.views7;
}

function trendingReason(card) {
  const s = card.stats;
  const parts = [
    [s.orders7 * 3, `${plural(s.orders7, 'order')} this week`],
    [s.bookings7 * 3, `${plural(s.bookings7, 'booking')} this week`],
    [s.reviews14 * 2, `${plural(s.reviews14, 'new review')}`],
    [s.wishlist7 * 2, `Saved ${plural(s.wishlist7, 'time')} this week`],
    [s.views7, `${plural(s.views7, 'view')} this week`],
  ];
  return parts.sort((a, b) => b[0] - a[0])[0][1];
}

function recommendTrending(cards, place, { limit = 8 } = {}) {
  const inArea = cards.filter((card) => card.distanceKm != null && card.distanceKm <= AREA_RADIUS_KM);
  const pool = inArea.length ? inArea : cards;
  const areaName = inArea.length ? (place.city || place.label) : '';

  const rising = pool
    .map((card) => ({ card, momentum: momentumOf(card) }))
    .filter((entry) => entry.momentum > 0)
    .sort((a, b) => b.momentum - a.momentum)
    .map(({ card }) => ({ ...card, reason: trendingReason(card) }));

  const used = new Set(rising.map((card) => card._id));
  const fill = pool
    .filter((card) => !used.has(card._id))
    .sort((a, b) => b.popularity - a.popularity || bayesRating(b) - bayesRating(a))
    .map((card) => ({ ...card, reason: areaName ? `Popular in ${areaName}` : fallbackReason(card) }));

  return [...rising, ...fill].slice(0, limit);
}

const HIGHLIGHT_SLOTS = [
  { key: 'forYou', label: 'Recommended for You' },
  { key: 'nearYou', label: 'Based on Your Location' },
  { key: 'alsoViewed', label: 'People Also Viewed' },
  { key: 'trending', label: 'Trending in Your Area' },
];

/** One card per recommendation type, never repeating a business. */
function pickHighlights(lists) {
  const used = new Set();
  return HIGHLIGHT_SLOTS.map((slot) => {
    const card = (lists[slot.key] || []).find((item) => !used.has(item._id));
    if (!card) return null;
    used.add(card._id);
    return { slot: slot.key, label: slot.label, business: card };
  }).filter(Boolean);
}

module.exports = {
  bayesRating,
  buildUserProfile,
  recommendForYou,
  recommendNearby,
  recommendAlsoViewed,
  recommendTrending,
  pickHighlights,
  momentumOf,
  AREA_RADIUS_KM,
  HIGHLIGHT_SLOTS,
};
