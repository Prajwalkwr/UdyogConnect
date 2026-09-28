// Keep keyword lists in sync with client/src/utils/categoryGroups.js.
const CATEGORY_GROUPS = [
  { key: 'grocery', keywords: ['grocery', 'grocer', 'spice', 'supermarket', 'mart', 'kirana', 'vegetable', 'fruit', 'dairy'] },
  { key: 'restaurants', keywords: ['restaurant', 'food', 'cafe', 'café', 'bakery', 'dining', 'momo', 'eatery', 'coffee', 'bar & grill'] },
  { key: 'electronics', keywords: ['electronic', 'mobile', 'computer', 'gadget', 'laptop', 'phone'] },
  { key: 'clothing', keywords: ['cloth', 'fashion', 'apparel', 'boutique', 'tailor', 'garment', 'wear', 'shoe'] },
  { key: 'pharmacy', keywords: ['pharma', 'medical', 'medicine', 'drug', 'chemist'] },
  { key: 'beauty', keywords: ['beauty', 'salon', 'spa', 'parlour', 'parlor', 'barber', 'cosmetic'] },
  { key: 'gym', keywords: ['gym', 'fitness', 'yoga', 'sport'] },
  { key: 'hotels', keywords: ['hotel', 'lodge', 'homestay', 'resort', 'guest house', 'guesthouse', 'hostel'] },
  { key: 'home', keywords: ['home', 'furniture', 'repair', 'plumb', 'interior', 'decor', 'hardware', 'cleaning', 'electrician'] },
];

function categoryText(business) {
  return `${business?.category || ''} ${business?.subcategory || ''}`.toLowerCase();
}

function categoryGroupsOf(business) {
  const text = categoryText(business);
  return CATEGORY_GROUPS.filter((group) => group.keywords.some((word) => text.includes(word))).map((group) => group.key);
}

const CITY_CENTERS = {
  kathmandu: [27.7172, 85.324],
  lalitpur: [27.6588, 85.3247],
  bhaktapur: [27.671, 85.4298],
  kirtipur: [27.6781, 85.2775],
  pokhara: [28.2096, 83.9856],
  bharatpur: [27.6833, 84.4333],
  chitwan: [27.5291, 84.3542],
  biratnagar: [26.4525, 87.2718],
  dharan: [26.8065, 87.2846],
  itahari: [26.6646, 87.2718],
  birgunj: [27.0104, 84.877],
  hetauda: [27.4284, 85.0322],
  butwal: [27.7006, 83.4483],
  bhairahawa: [27.5048, 83.4526],
  nepalgunj: [28.05, 81.6167],
  dhangadhi: [28.6852, 80.6216],
  janakpur: [26.7288, 85.9254],
  dhulikhel: [27.6253, 85.5561],
  banepa: [27.6298, 85.5214],
};

const LOCALITY_CENTERS = {
  kathmandu: ['baneshwor', 'thamel', 'kalanki', 'koteshwor', 'boudha', 'chabahil', 'balaju', 'maharajgunj', 'lazimpat',
    'new road', 'newroad', 'asan', 'swayambhu', 'sinamangal', 'tinkune', 'gongabu', 'budhanilkantha', 'kalimati',
    'tripureshwor', 'putalisadak', 'bagbazar', 'durbar marg', 'durbarmarg', 'naxal', 'baluwatar', 'jorpati',
    'sitapaila', 'chandragiri', 'tokha', 'kapan', 'samakhusi', 'basundhara', 'bansbari', 'battisputali', 'gaushala'],
  lalitpur: ['patan', 'jawalakhel', 'pulchowk', 'kupondole', 'sanepa', 'satdobato', 'lagankhel', 'imadol', 'gwarko',
    'ekantakuna', 'bhaisepati', 'kumaripati', 'mangal bazar'],
  bhaktapur: ['suryabinayak', 'thimi', 'madhyapur', 'sallaghari'],
  pokhara: ['lakeside', 'damside', 'mahendrapool', 'chipledhunga', 'baidam'],
};

const titleCase = (text) => text.replace(/\b\w/g, (c) => c.toUpperCase());

/** Resolves free text like "Baneshwor, Kathmandu" to approximate coordinates. */
function resolvePlace(text) {
  const value = String(text || '').toLowerCase().trim();
  if (!value) return null;
  for (const [city, localities] of Object.entries(LOCALITY_CENTERS)) {
    const locality = localities.find((name) => value.includes(name));
    if (locality) {
      const [lat, lng] = CITY_CENTERS[city];
      return { label: titleCase(locality), city: titleCase(city), lat, lng };
    }
  }
  const city = Object.keys(CITY_CENTERS).find((name) => value.includes(name));
  if (!city) return null;
  const [lat, lng] = CITY_CENTERS[city];
  return { label: titleCase(city), city: titleCase(city), lat, lng };
}

module.exports = { CATEGORY_GROUPS, categoryGroupsOf, resolvePlace, CITY_CENTERS };
