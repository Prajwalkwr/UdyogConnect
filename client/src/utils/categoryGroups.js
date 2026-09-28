// Keep keyword lists in sync with server/home/catalog.js.
export const CATEGORY_GROUP_KEYWORDS = {
  grocery: ['grocery', 'grocer', 'spice', 'supermarket', 'mart', 'kirana', 'vegetable', 'fruit', 'dairy'],
  restaurants: ['restaurant', 'food', 'cafe', 'café', 'bakery', 'dining', 'momo', 'eatery', 'coffee', 'bar & grill'],
  electronics: ['electronic', 'mobile', 'computer', 'gadget', 'laptop', 'phone'],
  clothing: ['cloth', 'fashion', 'apparel', 'boutique', 'tailor', 'garment', 'wear', 'shoe'],
  pharmacy: ['pharma', 'medical', 'medicine', 'drug', 'chemist'],
  beauty: ['beauty', 'salon', 'spa', 'parlour', 'parlor', 'barber', 'cosmetic'],
  gym: ['gym', 'fitness', 'yoga', 'sport'],
  hotels: ['hotel', 'lodge', 'homestay', 'resort', 'guest house', 'guesthouse', 'hostel'],
  home: ['home', 'furniture', 'repair', 'plumb', 'interior', 'decor', 'hardware', 'cleaning', 'electrician'],
};

/** Quick-filter chip names on the home page mapped to category groups. */
export const QUICK_FILTER_GROUP = {
  Grocery: 'grocery',
  Restaurants: 'restaurants',
  Electronics: 'electronics',
  Clothing: 'clothing',
  Pharmacy: 'pharmacy',
  'Beauty Salon': 'beauty',
  Gym: 'gym',
  Hotels: 'hotels',
  'Home Services': 'home',
};

const SHOP_KEYWORDS = ['shop', 'store', 'gift', 'craft', 'souvenir', 'furniture', 'book', 'jewel', 'handicraft', 'boutique'];
const SERVICE_KEYWORDS = ['service', 'repair', 'laundry', 'tuition', 'consult', 'plumb', 'cleaning', 'electrician', 'salon'];
const WELLNESS_KEYWORDS = ['health', 'wellness', 'clinic', 'dental', 'hospital', 'physio'];

const textOf = (business) => `${business?.category || ''} ${business?.subcategory || ''}`.toLowerCase();
const hasAny = (text, words) => words.some((word) => text.includes(word));

export function matchesCategoryGroup(business, groupKey) {
  const words = CATEGORY_GROUP_KEYWORDS[groupKey];
  if (!words) return false;
  const text = textOf(business);
  return hasAny(text, words) || String(business?.category || '').toLowerCase() === groupKey;
}

export const POPULAR_TABS = [
  { key: 'restaurants', label: 'Restaurants' },
  { key: 'shops', label: 'Shops' },
  { key: 'services', label: 'Services' },
  { key: 'wellness', label: 'Health & Wellness' },
  { key: 'hotels', label: 'Hotels' },
];

export function matchesPopularTab(business, tabKey) {
  const text = textOf(business);
  switch (tabKey) {
    case 'restaurants':
      return matchesCategoryGroup(business, 'restaurants');
    case 'shops':
      return !matchesCategoryGroup(business, 'restaurants') && !matchesCategoryGroup(business, 'hotels')
        && (['grocery', 'clothing', 'electronics', 'pharmacy'].some((key) => matchesCategoryGroup(business, key))
          || hasAny(text, SHOP_KEYWORDS)
          || business?.offeringType === 'products');
    case 'services':
      return hasAny(text, SERVICE_KEYWORDS)
        || (matchesCategoryGroup(business, 'home') && !hasAny(text, ['furniture', 'decor']))
        || business?.offeringType === 'services';
    case 'wellness':
      return ['pharmacy', 'beauty', 'gym'].some((key) => matchesCategoryGroup(business, key)) || hasAny(text, WELLNESS_KEYWORDS);
    case 'hotels':
      return matchesCategoryGroup(business, 'hotels');
    default:
      return true;
  }
}
