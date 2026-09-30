const SUGGESTION_LIMIT = 6;
const SUGGESTIONS_PER_BUSINESS = 3;
const SUGGESTION_AREA_KM = 25;

// Keywords match whole words, with an optional plural "s"/"es" ("phone" matches "phones", not "phonetic").
const SUGGESTION_GROUPS = [
  { key: 'food', keywords: ['restaurant', 'food', 'cafe', 'café', 'coffee', 'tea', 'bakery', 'bakeries', 'cake', 'momo', 'pizza', 'burger', 'eatery', 'eateries', 'meal', 'platter', 'thali', 'khaja', 'catering', 'cooking', 'snack', 'juice', 'bar & grill', 'kitchen', 'sweet', 'dessert', 'noodle', 'biryani', 'traditional meal'] },
  { key: 'grocery', keywords: ['grocery', 'groceries', 'grocer', 'kirana', 'mart', 'supermarket', 'rice', 'dal', 'spice', 'masala', 'turmeric', 'flour', 'atta', 'vegetable', 'fruit', 'dairy', 'milk', 'ghee', 'cooking oil'] },
  { key: 'electronics', keywords: ['electronic', 'mobile', 'phone', 'smartphone', 'iphone', 'laptop', 'computer', 'tablet', 'gadget', 'earbud', 'earphone', 'headphone', 'charger', 'camera', 'tv', 'television', 'speaker', 'smartwatch', 'printer', 'router', 'appliance'] },
  { key: 'fashion', keywords: ['cloth', 'clothing', 'clothes', 'fashion', 'apparel', 'boutique', 'tailor', 'tailoring', 'garment', 'wear', 'shirt', 't-shirt', 'dress', 'kurta', 'saree', 'sari', 'jacket', 'jeans', 'shoe', 'sneaker', 'handbag'] },
  { key: 'pharmacy', keywords: ['pharmacy', 'pharmacies', 'pharma', 'medical', 'medicine', 'drug', 'drugstore', 'chemist', 'clinic', 'vitamin'] },
  { key: 'beauty', keywords: ['beauty', 'salon', 'spa', 'parlour', 'parlor', 'barber', 'barbershop', 'cosmetic', 'makeup', 'haircut', 'hair', 'skincare', 'facial', 'manicure'] },
  { key: 'fitness', keywords: ['gym', 'fitness', 'yoga', 'sport', 'sportswear', 'workout', 'protein'] },
  { key: 'stay', keywords: ['hotel', 'lodge', 'homestay', 'resort', 'guest house', 'guesthouse', 'hostel'] },
  { key: 'home', keywords: ['home service', 'home essential', 'home decor', 'furniture', 'repair', 'repairing', 'plumbing', 'plumber', 'interior', 'decor', 'hardware', 'cleaning', 'electrician', 'electrical', 'sofa', 'dining set', 'polish', 'carpenter', 'paint', 'painting'] },
  { key: 'gifts', keywords: ['gift', 'craft', 'souvenir', 'handmade', 'handicraft', 'arts', 'lokta', 'journal', 'basket', 'thangka', 'singing bowl'] },
];

// Groups shoppers of one kind of business are likely to want next.
const RELATED_GROUPS = {
  food: ['grocery'],
  grocery: ['food'],
  electronics: [],
  fashion: ['beauty', 'gifts'],
  pharmacy: ['beauty', 'fitness'],
  beauty: ['fashion', 'pharmacy'],
  fitness: ['pharmacy'],
  stay: ['food'],
  home: [],
  gifts: ['fashion'],
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GROUP_PATTERNS = SUGGESTION_GROUPS.map((group) => ({
  key: group.key,
  pattern: new RegExp(`(^|[^a-z])(${group.keywords.map(escapeRegExp).join('|')})(s|es)?(?![a-z])`, 'i'),
}));

const textOf = (...values) => values.flat(Infinity).filter(Boolean).map(String).join(' ').toLowerCase();

function groupsOfText(text) {
  if (!text) return new Set();
  return new Set(GROUP_PATTERNS.filter((group) => group.pattern.test(text)).map((group) => group.key));
}

const businessText = (business) => textOf(business?.category, business?.subcategory, business?.name);
const itemText = (item) => textOf(item?.name, item?.category);
const intersects = (a, b) => [...a].some((key) => b.has(key));

/** The kinds of business this one is, falling back to what it sells when its category is vague. */
function groupsOfBusiness(business, ownItems = []) {
  const groups = groupsOfText(businessText(business));
  if (groups.size) return groups;
  return groupsOfText(ownItems.map(itemText).join(' '));
}

/**
 * Picks "You may also like" items for a business profile: the same kind of business first
 * (a cafe gets other cafes and food, an electronics shop gets phones and laptops),
 * then related kinds, then nearby popular items so the row is never half empty.
 */
function buildSuggestions({ business, businesses, products, services, isLive, distanceKm, limit = SUGGESTION_LIMIT }) {
  const toPlain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc });
  const currentId = String(business._id);
  const liveById = new Map(
    businesses
      .filter((b) => isLive(b) && String(b._id) !== currentId)
      .map((b) => [String(b._id), toPlain(b)])
  );

  const ownItems = [...products, ...services].filter((item) => String(item.businessId) === currentId);
  const targetGroups = groupsOfBusiness(business, ownItems);
  const relatedGroups = new Set([...targetGroups].flatMap((key) => RELATED_GROUPS[key] || []).filter((key) => !targetGroups.has(key)));
  const ownerGroups = new Map([...liveById].map(([id, owner]) => [id, groupsOfText(businessText(owner))]));
  const preferredKind = business.offeringType === 'services' ? 'service' : business.offeringType === 'products' ? 'product' : '';

  const candidates = [
    ...products.map((doc) => ({ kind: 'product', item: toPlain(doc) })),
    ...services.map((doc) => ({ kind: 'service', item: toPlain(doc) })),
  ].filter(({ kind, item }) => {
    if (!liveById.has(String(item.businessId)) || !item.name || item.availability === false) return false;
    if (kind === 'product' && (/^Product [A-Z]$/i.test(String(item.name)) || (item.stock != null && Number(item.stock) <= 0))) return false;
    return Number(item.price) > 0;
  });

  const scored = candidates.map(({ kind, item }) => {
    const ownerId = String(item.businessId);
    const owner = liveById.get(ownerId);
    const shopGroups = ownerGroups.get(ownerId);
    const productGroups = groupsOfText(itemText(item));
    const sameShopType = intersects(shopGroups, targetGroups);
    const sameItemType = intersects(productGroups, targetGroups);
    const relatedType = intersects(shopGroups, relatedGroups) || intersects(productGroups, relatedGroups);
    const relevance = (sameShopType ? 6 : 0) + (sameItemType ? 4 : 0) + (!sameShopType && !sameItemType && relatedType ? 3 : 0);

    const distance = distanceKm(business, owner);
    const imageUrl = item.imageUrl || item.image || (Array.isArray(item.images) ? item.images[0] : '') || '';
    const rating = Math.min(5, Math.max(0, Number(item.rating) || 0));
    const score = relevance
      + (distance != null && distance <= SUGGESTION_AREA_KM ? 1.5 : 0)
      + (imageUrl ? 1.5 : 0)
      + (kind === preferredKind ? 0.5 : 0)
      + rating / 5;

    const price = Number(item.price);
    const discount = kind === 'product' ? Math.min(90, Math.max(0, Number(item.discount) || 0)) : 0;
    return {
      score,
      card: {
        _id: String(item._id),
        kind,
        name: item.name,
        category: Array.isArray(item.category) ? item.category.filter(Boolean)[0] || '' : item.category || '',
        imageUrl,
        price: discount ? Math.round(price * (1 - discount / 100)) : price,
        originalPrice: discount ? price : null,
        discount,
        priceLabel: kind === 'service' ? item.priceLabel || null : null,
        rating,
        businessId: ownerId,
        businessName: owner.name || 'Local business',
        distanceKm: distance,
        match: relevance >= 4 ? 'similar' : relevance > 0 ? 'related' : 'popular',
      },
    };
  }).sort((a, b) => b.score - a.score || b.card.rating - a.card.rating);

  const perBusiness = new Map();
  const items = [];
  for (const { card } of scored) {
    const count = perBusiness.get(card.businessId) || 0;
    if (count >= SUGGESTIONS_PER_BUSINESS) continue;
    perBusiness.set(card.businessId, count + 1);
    items.push(card);
    if (items.length >= limit) break;
  }
  return { groups: [...targetGroups], items };
}

module.exports = { buildSuggestions, groupsOfText, groupsOfBusiness, SUGGESTION_LIMIT };
