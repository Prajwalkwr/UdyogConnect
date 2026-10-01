const { CATEGORY_GROUPS, resolvePlace } = require('../home/catalog');

const MAX_MESSAGE_LENGTH = 500;
const RADIUS_OPTIONS = [1, 3, 5, 10];

/** Everyday words mapped to marketplace categories and to whether people usually mean a product or a service. */
const CONCEPTS = [
  { kind: 'service', groups: ['beauty'], words: ['haircut', 'hair cut', 'hair', 'barber', 'shave', 'beard', 'facial', 'makeup', 'make up', 'manicure', 'pedicure', 'nail', 'massage', 'wax', 'threading', 'bridal', 'mehendi', 'salon', 'spa', 'parlour', 'parlor'] },
  { kind: 'product', groups: ['beauty'], words: ['cosmetic', 'lipstick', 'perfume', 'shampoo', 'lotion', 'cream', 'skincare'] },
  { kind: 'product', groups: ['electronics'], words: ['headphone', 'earphone', 'earbud', 'airpod', 'charger', 'cable', 'speaker', 'laptop', 'mobile', 'phone', 'smartphone', 'iphone', 'samsung', 'tablet', 'tv', 'television', 'camera', 'power bank', 'powerbank', 'mouse', 'keyboard', 'monitor', 'smartwatch'] },
  { kind: null, groups: ['electronics'], generic: true, words: ['gadget', 'electronic', 'computer'] },
  { kind: 'service', groups: ['home', 'electronics'], words: ['repair', 'fix', 'servicing', 'install', 'installation'] },
  { kind: 'service', groups: ['home'], words: ['plumber', 'plumbing', 'electrician', 'wiring', 'cleaning', 'cleaner', 'carpenter', 'painter', 'pest control'] },
  { kind: 'product', groups: ['home'], words: ['furniture', 'sofa', 'bed', 'table', 'chair', 'hardware', 'decor', 'paint'] },
  { kind: 'product', groups: ['pharmacy'], words: ['medicine', 'medical', 'pharmacy', 'paracetamol', 'syrup', 'bandage', 'mask', 'sanitizer', 'vitamin', 'drug', 'chemist'] },
  { kind: null, groups: ['restaurants'], generic: true, words: ['relax', 'drink', 'eat', 'hungry', 'lunch', 'dinner', 'breakfast', 'snack', 'bakery', 'restaurant', 'cafe', 'food', 'dining', 'hang out', 'date night'] },
  { kind: null, groups: ['restaurants'], words: ['momo', 'pizza', 'burger', 'coffee', 'tea', 'juice', 'cake', 'chowmein', 'thakali', 'biryani'] },
  { kind: 'service', groups: ['hotels'], generic: true, words: ['stay', 'room', 'overnight', 'accommodation', 'lodging', 'hotel', 'homestay', 'hostel', 'resort', 'guest house', 'guesthouse', 'lodge'] },
  { kind: 'service', groups: ['gym'], generic: true, words: ['workout', 'exercise', 'training', 'trainer', 'fitness', 'yoga', 'zumba', 'gym', 'membership'] },
  { kind: 'product', groups: ['grocery'], generic: true, words: ['grocery', 'groceries', 'kirana', 'supermarket', 'dairy'] },
  { kind: 'product', groups: ['grocery'], words: ['rice', 'dal', 'oil', 'sugar', 'salt', 'vegetable', 'fruit', 'milk', 'egg', 'atta', 'flour', 'spice', 'masala', 'noodle', 'biscuit'] },
  { kind: 'product', groups: ['clothing'], generic: true, words: ['clothes', 'clothing', 'fashion', 'boutique'] },
  { kind: 'product', groups: ['clothing'], words: ['shirt', 'tshirt', 't-shirt', 'pant', 'jeans', 'dress', 'kurta', 'saree', 'sari', 'jacket', 'shoe', 'sneaker'] },
  { kind: 'service', groups: ['clothing'], words: ['tailor', 'stitching', 'alteration'] },
];

/** Words people use for the same thing, including common romanised Nepali. Matching any one matches the others. */
const ALIAS_GROUPS = [
  ['turmeric', 'besar', 'haldi'],
  ['rice', 'chamal', 'basmati'],
  ['lentil', 'dal', 'daal'],
  ['vegetable', 'tarkari', 'sabji', 'sabzi'],
  ['meat', 'masu'],
  ['chicken', 'kukhura'],
  ['egg', 'anda'],
  ['milk', 'dudh'],
  ['tea', 'chiya', 'chai'],
  ['spice', 'masala'],
  ['medicine', 'aushadhi', 'ausadhi', 'dabai', 'dawai'],
  ['clothes', 'clothing', 'kapada', 'kapda', 'lugaa', 'luga'],
  ['shoe', 'jutta', 'juta', 'footwear', 'sneaker'],
  ['phone', 'mobile', 'smartphone', 'cellphone'],
  ['headphone', 'headset', 'earphone', 'earbud'],
  ['tv', 'television'],
  ['journal', 'notebook', 'diary'],
  ['gift', 'souvenir'],
  ['handicraft', 'handmade', 'craft'],
  ['cake', 'pastry'],
  ['momo', 'dumpling'],
  ['noodle', 'chowmein'],
  ['repair', 'fix', 'servicing'],
  ['electrician', 'electrical', 'wiring'],
  ['cleaning', 'cleaner'],
  ['catering', 'caterer', 'feast'],
  ['delivery', 'deliver'],
];

const SERVICE_WORDS = /\b(services?|book|booking|appointment|schedule|hire)\b/;
const PRODUCT_WORDS = /\b(products?|items?|buy|purchase|in stock|add to cart)\b/;
const BUSINESS_WORDS = /\b(shops?|stores?|business(es)?|places?|outlets?|sellers?|vendors?)\b/;

const HELP_TERMS = [
  'cancel', 'cancellation', 'refund', 'return', 'payment', 'pay', 'esewa', 'cod', 'cash on delivery', 'checkout',
  'register', 'registration', 'sign up', 'signup', 'approve', 'approval', 'verified', 'suspend', 'password', 'forgot',
  'review', 'rating', 'otp', 'delivery code', 'bill', 'invoice', 'receipt', 'policy', 'rule', 'how do i', 'how to',
  'how can i', 'can i', 'what is udyogconnect', 'about udyogconnect', 'sell on', 'become a seller', 'wishlist', 'saved',
  'chat with', 'message a', 'contact', 'delivery fee', 'delivery radius', 'pickup', 'commission', 'account', 'privacy',
  'recommendation', 'open or closed', 'opening hours',
];

const SUPPORT_PATTERN = /\b(customer\s*(care|service|support)|support\s*(team|number|phone|email|mail|contact|center|centre|desk)|help\s*(desk|line|center|centre)|helpline|hotline|call\s*cent(er|re)|(contact|reach|call|email|mail)\s+(udyog\s*connect|the\s+(website|site|platform|company|team|admin|owners?|support)|you|admin|support)|udyog\s*connect('?s)?\s+(contact|phone|number|email|mail|address|office)|your\s+(contact|phone|number|email|mail|address|office)|talk\s+to\s+(a\s+)?(human|person|someone|agent|support|admin)|complain|complaint|report\s+(a\s+)?(problem|issue|bug|scam|fraud))/;
const CONTACT_PATTERN = /\b(contacts?|phone|number|call|email|e-mail|mail|mobile|reach|whatsapp)\b/;
const OVERVIEW_PATTERN = /\b(what|which)\s+(categories|category|kinds?|types?)\b|\bwhat\s+can\s+i\s+(buy|find|get|order|book)\b|\bwhat\s+(do|does)\s+(you|udyog\s*connect|this\s+(site|website|app))\s+(have|sell|offer)\b|\bwhat('s|\s+is)\s+available\b/;
const ASPECTS = [
  ['contact', CONTACT_PATTERN],
  ['hours', /\b(open|opens|opening|close|closes|closed|closing|hours?|timings?|time|schedule)\b/],
  ['delivery', /\b(deliver|delivers|delivery|home delivery|ship|shipping)\b/],
  ['rating', /\b(rating|ratings|rated|reviews?|stars?)\b/],
  ['location', /\b(where|address|location|located|directions?|map|how far|distance)\b/],
  ['catalog', /\b(menu|products?|items?|sells?|selling|stock|have|offers?|services?|price list|what can i (buy|get|order|book))\b/],
];
/** Words that describe what is being asked about a business rather than an item to search for. */
const ASPECT_WORDS = new Set(['contact', 'phone', 'number', 'call', 'email', 'mail', 'mobile', 'reach', 'whatsapp', 'detail', 'info',
  'information', 'hour', 'timing', 'time', 'schedule', 'close', 'closed', 'closing', 'opening', 'deliver', 'delivery', 'ship',
  'shipping', 'rating', 'rated', 'review', 'star', 'address', 'location', 'located', 'direction', 'map', 'far', 'distance', 'menu',
  'stock', 'list', 'tell', 'cost', 'costs', 'their', 'they', 'them', 'does', 'still']);

const INJECTION_PATTERN = /(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompts?|guidelines?)|system prompt|developer mode|jailbreak|\bdan\b mode|reveal.{0,30}\b(prompt|instructions?|key|secret|password|token)|api[_ ]?key|openai_api_key|jwt_secret|mongodb_uri|database (password|credentials?)|(show|list|give|dump).{0,30}\b(all )?(users?|customers?|emails?|phone numbers?|passwords?)\b.{0,20}(database|db|table|of all)/i;

const STOPWORDS = new Set(('a an the and or but of for to in on at by with from is are was were be been am i me my mine we our you your it its this that '
  + 'these those there here what which who whom whose where when why how can could should would will shall do does did please '
  + 'find show give get list recommend suggest search look looking want need some any all best good great top cheap cheapest '
  + 'nearest nearby near around close closest me us local available availability open now today tonight currently right under '
  + 'below less than more over above within upto up maximum max minimum min npr rs rupee rupees price prices cost km kilometer '
  + 'kilometers meter shop shops store stores business businesses place places service services product products item items '
  + 'buy book booking hire udyogconnect ai assistant hi hello hey namaste thanks thank also just like about into get got sell '
  + 'sells selling offer offers offering have has one ones lot lots much many very really kind type sort something someone').split(' '));

const normalize = (text) => String(text || '')
  .normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stem = (word) => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
};

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
}

function keywordsOf(text) {
  return [...new Set(tokenize(text).filter((word) => word.length > 1 && !STOPWORDS.has(word) && !/^\d+$/.test(word)).map(stem))];
}

const ALIASES = new Map();
ALIAS_GROUPS.forEach((group) => {
  const stems = group.map(stem);
  stems.forEach((word) => ALIASES.set(word, [...new Set([...(ALIASES.get(word) || []), ...stems])]));
});

/** The word plus its aliases ("besar" -> turmeric, haldi). */
const expandWord = (word) => ALIASES.get(word) || [word];

/** True when two words differ by one edit or one swapped pair of letters (typo tolerance). */
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff = [...a].map((char, index) => (char === b[index] ? -1 : index)).filter((index) => index >= 0);
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (a.length > b.length) i += 1;
      else if (b.length > a.length) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Same word, a shared stem such as plumber/plumbing or haircut/hair, or a one-letter typo such as "turmric". */
function wordsMatch(a, b) {
  if (a === b) return true;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  if (common >= Math.max(4, Math.min(a.length, b.length) - 2)) return true;
  // Typos keep the first letter, which also stops "iphone" from matching "phone".
  return a.length >= 5 && b.length >= 5 && a[0] === b[0] && withinOneEdit(a, b);
}

function detectAspect(lower) {
  const hit = ASPECTS.find(([, pattern]) => pattern.test(lower));
  return hit ? hit[0] : null;
}

const containsPhrase = (lower, phrase) => new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?($|[^a-z])`).test(lower);

function snapRadius(km) {
  const value = Number(km);
  if (!Number.isFinite(value) || value <= 0) return null;
  return RADIUS_OPTIONS.find((option) => option >= value) || RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
}

const parseAmount = (raw) => {
  const text = String(raw || '').toLowerCase().replace(/,/g, '');
  const match = text.match(/(\d+(?:\.\d+)?)\s*(k|thousand)?/);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const AMOUNT = '(?:npr|rs\\.?|rupees?)?\\s*([\\d,]+(?:\\.\\d+)?\\s*(?:k|thousand)?)(?!\\s*(?:km|kilomet|m\\b|meter|min|minute|hour|hr|day|star))';

function parsePrice(lower) {
  const between = lower.match(new RegExp(`between\\s*${AMOUNT}\\s*(?:and|-|to)\\s*${AMOUNT}`));
  if (between) {
    const a = parseAmount(between[1]);
    const b = parseAmount(between[2]);
    if (a && b) return { minPrice: Math.min(a, b), maxPrice: Math.max(a, b) };
  }
  const max = lower.match(new RegExp(`(?:under|below|less than|cheaper than|within|upto|up to|max(?:imum)?|budget(?: of)?|<|not more than)\\s*${AMOUNT}`));
  const min = lower.match(new RegExp(`(?:above|over|more than|at least|min(?:imum)?|>)\\s*${AMOUNT}`));
  return { minPrice: min ? parseAmount(min[1]) : null, maxPrice: max ? parseAmount(max[1]) : null };
}

/**
 * Turns a free-text question into structured search filters. Deterministic and side-effect free,
 * so the marketplace search works the same whether or not the AI model is reachable.
 */
function parseQuery(message, { role } = {}) {
  const text = normalize(message).slice(0, MAX_MESSAGE_LENGTH);
  const lower = text.toLowerCase();
  // "phone number" asks for contact details, not for a phone to buy.
  const itemText = lower.replace(/\b(phone|mobile|cell|contact|whatsapp)\s*(no\.?|number|num|nos?)\b/g, ' contact ');

  const groups = new Set();
  const conceptTerms = [];
  let conceptKind = null;
  CONCEPTS.forEach((concept) => {
    const hit = concept.words.find((word) => containsPhrase(itemText, word));
    if (!hit) return;
    concept.groups.forEach((group) => groups.add(group));
    if (concept.generic) return;
    conceptTerms.push(hit);
    if (concept.kind && !conceptKind) conceptKind = concept.kind;
  });
  CATEGORY_GROUPS.forEach((group) => {
    if (group.key !== 'home' && group.keywords.some((word) => containsPhrase(itemText, word))) groups.add(group.key);
  });

  let kind = 'any';
  if (SERVICE_WORDS.test(lower)) kind = 'service';
  else if (PRODUCT_WORDS.test(lower)) kind = 'product';
  else if (BUSINESS_WORDS.test(lower) && !conceptKind) kind = 'business';
  else if (conceptKind) kind = conceptKind;

  const { minPrice, maxPrice } = parsePrice(lower);
  if ((minPrice || maxPrice) && kind === 'business') kind = 'any';

  const radiusMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet)/);
  const radiusKm = radiusMatch ? snapRadius(radiusMatch[1]) : null;
  const nearMe = /\b(near\s*(me|by)?|nearby|nearest|closest|close to me|around me|around here|in my area)\b/.test(lower) || Boolean(radiusKm);
  const openNow = /\b(open now|open right now|currently open|open today|still open|open at the moment|is open)\b/.test(lower);

  let sort = null;
  if (/\b(cheapest|lowest price|low price|affordable|budget|cheap)\b/.test(lower)) sort = 'price';
  else if (/\b(best|top|highest rated|top rated|best rated|popular|famous)\b/.test(lower)) sort = 'rating';
  else if (/\b(nearest|closest)\b/.test(lower)) sort = 'distance';

  const place = resolvePlace(lower);
  const keywords = keywordsOf(text).filter((word) => !(place && place.label.toLowerCase().split(' ').includes(word)));
  const helpScore = HELP_TERMS.reduce((score, term) => score + (containsPhrase(lower, term) ? 1 : 0), 0);
  const isQuestion = /\?$|^(how|what|why|when|can|do|does|is|are|will|should|who)\b/.test(lower);
  const hasSearchSignals = groups.size > 0 || nearMe || openNow || minPrice !== null || maxPrice !== null
    || /\b(find|show|recommend|suggest|search|looking for|where can i|where to|any)\b/.test(lower);

  const asksContact = CONTACT_PATTERN.test(lower) && groups.size === 0 && conceptTerms.length === 0 && minPrice === null && maxPrice === null;

  let intent = 'search';
  if (!text) intent = 'empty';
  else if (INJECTION_PATTERN.test(text)) intent = 'unsafe';
  else if (/^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|thanks|thank you|ok|okay)[!. ]*$/.test(lower)) intent = 'greeting';
  else if (SUPPORT_PATTERN.test(lower)) intent = 'support';
  else if (asksContact && !/\b(my|mine)\b.{0,20}\b(orders?|bookings?)\b/.test(lower)) intent = 'contact';
  else if (OVERVIEW_PATTERN.test(lower) && groups.size === 0 && conceptTerms.length === 0) intent = 'overview';
  else if (role === 'seller' && /\b(my|our)\b.{0,25}\b(business|shop|store|products?|stock|inventory|services?|orders?|sales|revenue|earnings|reviews?|ratings?|bookings?|customers?|performance|analytics)\b|\blow stock\b|\bout of stock\b.{0,20}\bmy\b/.test(lower)) intent = 'seller';
  else if (role === 'admin' && /\b(pending|approval|approve|platform|marketplace|how many|total|statistics|stats|overview|reports?|suspended|rejected)\b/.test(lower)) intent = 'admin';
  else if (helpScore > 0 && groups.size === 0 && !nearMe && minPrice === null && maxPrice === null
    && /^(how|can|could|what|why|is it possible|am i able)\b/.test(lower)) intent = 'help';
  else if (/\b(my|mine)\b.{0,20}\b(orders?|purchases?|deliver(y|ies)|parcel|package)\b|\bwhere is my\b|\btrack\b.{0,15}\border\b|\border status\b/.test(lower)) intent = 'my_orders';
  else if (/\b(my|mine)\b.{0,20}\b(bookings?|appointments?|reservations?)\b/.test(lower)) intent = 'my_bookings';
  else if (helpScore > 0 && (!hasSearchSignals || (isQuestion && groups.size === 0))) intent = 'help';

  return {
    text,
    lower,
    intent,
    kind,
    groups: [...groups],
    conceptTerms,
    keywords,
    minPrice,
    maxPrice,
    radiusKm,
    nearMe,
    openNow,
    sort,
    place,
    aspect: detectAspect(lower),
    wantsHelp: helpScore > 0,
  };
}

module.exports = {
  parseQuery,
  keywordsOf,
  tokenize,
  stem,
  snapRadius,
  normalize,
  expandWord,
  wordsMatch,
  RADIUS_OPTIONS,
  MAX_MESSAGE_LENGTH,
  STOPWORDS,
  ASPECT_WORDS,
  BUSINESS_WORDS,
};
